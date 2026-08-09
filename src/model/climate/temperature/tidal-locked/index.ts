import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { TEMPERATURE_SHARED } from "@/model/climate/shared/temperature"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import type {
	ComputeTidalTemperatureParams,
	LockedDeclinationParams,
	LockedMonthlyDaylightHoursParams,
	LockedStarRadiationParams,
	MonthlyLibrationParams,
	SubstellarDirectionParams,
	TidalTransportParams,
} from "@/model/climate/temperature/tidal-locked/types"
import type { GenesisClimate } from "@/model/climate/types"
import { ELEVATION } from "@/model/geography/terrain/elevation"
import type { GenesisParams } from "@/model/pipelines/types"
import { TIME } from "@/model/shared/time"
import { UNITS } from "@/model/shared/units"

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value))
}

function smoothstep01(value: number): number {
	const t = clamp01(value)
	return t * t * (3 - 2 * t)
}

function clampAcosInput(value: number): number {
	return Math.max(-1, Math.min(1, value))
}

function computeDailyLockedOrbit(
	params: Pick<
		GenesisParams,
		| "eccentricity"
		| "perihelion"
		| "spectralClass"
		| "starSubtype"
		| "orbitalDistanceAU"
	> &
		LockedStarRadiationParams,
): { flux: number[]; libration: number[]; solarLongitude: number[] } {
	const { SIGMA, R_SUN, AU } = CONSTANTS.embConstants.stellar
	const cls: MainSequenceClass = STAR.isValidSpectralClass(params.spectralClass)
		? params.spectralClass
		: "G"
	const T_star =
		params.starTemperatureK ??
		STAR.getStarTemperatureK({ cls, subtype: params.starSubtype })
	const R_star =
		(params.starDiameterSol ??
			STAR.getStarDiameterSol({ cls, subtype: params.starSubtype })) * R_SUN
	const d = params.orbitalDistanceAU * AU
	const s0 =
		(SIGMA * Math.pow(T_star, 4) * Math.pow(R_star, 2)) / Math.pow(d, 2)
	const ecc = params.eccentricity
	const PI = Math.PI
	const perihelionRad = (params.perihelion * Math.PI) / 180
	const longP = perihelionRad + PI
	const equinoxOffsetRad =
		(40 * 2 * Math.PI) / CONSTANTS.embConstants.time.DAYS_PER_YEAR

	const calcEccFromTrue = ({
		trueAnomaly,
		eccentricity,
	}: {
		trueAnomaly: number
		eccentricity: number
	}): number => {
		const acosInput = clampAcosInput(
			(eccentricity + Math.cos(trueAnomaly)) /
				(1 + eccentricity * Math.cos(trueAnomaly)),
		)
		return trueAnomaly > PI
			? 2 * PI - Math.acos(acosInput)
			: Math.acos(acosInput)
	}

	let trueL = -equinoxOffsetRad
	let trueA = trueL - longP
	while (trueA < 0) trueA += 2 * PI
	let eccA = calcEccFromTrue({ trueAnomaly: trueA, eccentricity: ecc })
	let meanL = eccA - ecc * Math.sin(eccA) + longP

	const flux = new Array<number>(
		CONSTANTS.embConstants.time.DAYS_PER_YEAR,
	).fill(0)
	const libration = new Array<number>(
		CONSTANTS.embConstants.time.DAYS_PER_YEAR,
	).fill(0)
	const solarLongitude = new Array<number>(
		CONSTANTS.embConstants.time.DAYS_PER_YEAR,
	).fill(0)
	for (let day = 0; day < CONSTANTS.embConstants.time.DAYS_PER_YEAR; day++) {
		if (day !== 0) {
			meanL += (2 * PI) / CONSTANTS.embConstants.time.DAYS_PER_YEAR
			const meanA = meanL - longP
			eccA = meanA
			for (let iter = 0; iter < 10; iter++) eccA = meanA + ecc * Math.sin(eccA)
			while (eccA >= 2 * PI) eccA -= 2 * PI
			while (eccA < 0) eccA += 2 * PI
			const trueAnomalyInput = clampAcosInput(
				(Math.cos(eccA) - ecc) / (1 - ecc * Math.cos(eccA)),
			)
			trueA =
				eccA > PI
					? 2 * PI - Math.acos(trueAnomalyInput)
					: Math.acos(trueAnomalyInput)
			trueL = trueA + longP
		}

		while (trueL > 2 * PI) trueL -= 2 * PI
		while (trueL < 0) trueL += 2 * PI

		const astroDist = (1 - ecc * ecc) / (1 + ecc * Math.cos(trueA))
		flux[day] = s0 / (astroDist * astroDist)
		solarLongitude[day] = trueL

		const meanA = meanL - longP
		let lib = trueA - meanA
		while (lib > PI) lib -= 2 * PI
		while (lib < -PI) lib += 2 * PI
		libration[day] = lib
	}

	return { flux, libration, solarLongitude }
}

function computeMonthlyLibration({
	eccentricity,
	perihelion,
}: MonthlyLibrationParams): number[] {
	const ecc = eccentricity
	if (ecc < 1e-6) return new Array(12).fill(0)

	const { libration } = computeDailyLockedOrbit({
		eccentricity,
		perihelion,
		spectralClass: "G",
		starSubtype: 2,
		orbitalDistanceAU: 1,
	})
	const monthly: number[] = []
	for (let month = 0; month < 12; month++) {
		const days = TIME.month.days(month)
		let sum = 0
		for (const day of days) sum += libration[day]
		monthly.push(sum / Math.max(1, days.length))
	}
	return monthly
}

function getSignedEffectiveObliquityRad(obliquity: number): number {
	const magnitude = (UNITS.getEffectiveObliquityDeg(obliquity) * Math.PI) / 180
	return UNITS.isRetrogradeObliquity(obliquity) ? -magnitude : magnitude
}

function computeLockedSubstellarDeclinationRad({
	obliquity,
	solarLongitudeRad,
}: {
	obliquity: number
	solarLongitudeRad: number
}): number {
	const signedObliquityRad = getSignedEffectiveObliquityRad(obliquity)
	return Math.asin(Math.sin(signedObliquityRad) * Math.sin(solarLongitudeRad))
}

function computeMonthlyLockedDeclination({
	obliquity,
	eccentricity,
	perihelion,
}: LockedDeclinationParams): number[] {
	if (Math.abs(obliquity) < 1e-6) return new Array(12).fill(0)

	const { solarLongitude } = computeDailyLockedOrbit({
		eccentricity,
		perihelion,
		spectralClass: "G",
		starSubtype: 2,
		orbitalDistanceAU: 1,
	})
	const monthly: number[] = []
	for (let month = 0; month < 12; month++) {
		const days = TIME.month.days(month)
		let sum = 0
		for (const day of days)
			sum += computeLockedSubstellarDeclinationRad({
				obliquity,
				solarLongitudeRad: solarLongitude[day],
			})
		monthly.push(sum / Math.max(1, days.length))
	}
	return monthly
}

function getSubstellarDirWithOffsetAndDeclination({
	substellarLon,
	lonOffsetRad,
	declinationRad,
}: SubstellarDirectionParams): [number, number, number] {
	const subRad = (substellarLon % 360) * (Math.PI / 180) + lonOffsetRad
	const cosDeclination = Math.cos(declinationRad)
	return [
		cosDeclination * Math.cos(subRad),
		cosDeclination * Math.sin(subRad),
		Math.sin(declinationRad),
	]
}

function computeMonthlyOrbitalFlux(params: GenesisParams): number[] {
	const { flux } = computeDailyLockedOrbit(params)
	const monthly: number[] = []
	for (let month = 0; month < 12; month++) {
		const days = TIME.month.days(month)
		let sum = 0
		for (const day of days) sum += flux[day]
		monthly.push(sum / Math.max(1, days.length))
	}
	return monthly
}

function computeLockedMonthlyDaylightHours({
	mesh,
	params,
}: LockedMonthlyDaylightHoursParams): Float32Array {
	const N = mesh.numRegions
	const monthly = new Float32Array(N * 12)
	const monthlyLibration = computeMonthlyLibration({
		eccentricity: params.eccentricity,
		perihelion: params.perihelion,
	})
	const monthlyDeclination = computeMonthlyLockedDeclination({
		obliquity: params.obliquity,
		eccentricity: params.eccentricity,
		perihelion: params.perihelion,
	})
	for (let month = 0; month < 12; month++) {
		const sub = getSubstellarDirWithOffsetAndDeclination({
			substellarLon: params.substellarLon,
			lonOffsetRad: monthlyLibration[month],
			declinationRad: monthlyDeclination[month],
		})
		for (let r = 0; r < N; r++) {
			const x = mesh.r_xyz[3 * r]
			const y = mesh.r_xyz[3 * r + 1]
			const z = mesh.r_xyz[3 * r + 2]
			const cosTheta = x * sub[0] + y * sub[1] + z * sub[2]
			monthly[month * N + r] =
				cosTheta > 1e-6
					? params.hoursPerDay
					: cosTheta < -1e-6
						? 0
						: params.hoursPerDay / 2
		}
	}
	return monthly
}

function computeTidalTransportParams(
	params: Pick<
		GenesisParams,
		| "daysPerYear"
		| "eccentricity"
		| "planetRadiusKm"
		| "pressure"
		| "spectralClass"
		| "starSubtype"
		| "orbitalDistanceAU"
		| "seismologyTotalHeatingK"
	> &
		LockedStarRadiationParams,
): TidalTransportParams {
	const radiusM = params.planetRadiusKm * 1000
	const pressure = params.pressure ?? 1.0
	const ecc = params.eccentricity

	const { SIGMA, R_SUN, AU } = CONSTANTS.embConstants.stellar
	const cls: MainSequenceClass = STAR.isValidSpectralClass(params.spectralClass)
		? params.spectralClass
		: "G"
	const T_star =
		params.starTemperatureK ??
		STAR.getStarTemperatureK({ cls, subtype: params.starSubtype })
	const R_star =
		(params.starDiameterSol ??
			STAR.getStarDiameterSol({ cls, subtype: params.starSubtype })) * R_SUN
	const d = params.orbitalDistanceAU * AU
	const S0 =
		(SIGMA * Math.pow(T_star, 4) * Math.pow(R_star, 2)) / Math.pow(d, 2)
	const albedo = 0.3
	let T_eq = Math.pow((S0 * (1 - albedo)) / (4 * SIGMA), 0.25)
	// See ebm/index.ts's EBMConfig.seismologyTotalHeatingK doc -- same
	// post-solve quartic bump, applied here to this model's own equilibrium
	// temperature instead of a per-latitude EBM solve.
	const seismologyTotalHeatingK = params.seismologyTotalHeatingK ?? 0
	if (seismologyTotalHeatingK > 0) {
		T_eq = (T_eq ** 4 + seismologyTotalHeatingK ** 4) ** 0.25
	}
	const GREENHOUSE_OFFSET = 33
	const T_mean_C = T_eq - 273.15 + GREENHOUSE_OFFSET

	const radiusRatio = CONSTANTS.embConstants.planet.EARTH_RADIUS / radiusM
	const radiusFactor = radiusRatio * radiusRatio
	const pressureFactor = Math.pow(pressure, 0.5)
	const yearFactor = Math.pow(
		params.daysPerYear / CONSTANTS.embConstants.time.DAYS_PER_YEAR,
		0.25,
	)
	const transportFactor = radiusFactor * pressureFactor * yearFactor
	const pressureLog = Math.log10(Math.max(pressure, 0.1))
	const transportMix = 0.64 + 0.1 * Math.tanh((transportFactor - 1) * 1.15)
	const highPressureBoost = 0.1 * smoothstep01(pressureLog / 2)
	const redistribution = Math.max(
		0.35,
		Math.min(0.92, transportMix + highPressureBoost),
	)
	const contrast = 1 - redistribution

	const A1 = 50 * contrast
	const A_night = -90 * contrast
	const eccAmplitude = ecc * 8
	const gravityRatio = params.planetRadiusKm / 6371
	const LAPSE_RATE = 6.5 * gravityRatio
	const tidalTd = Math.max(5, 2 * eccAmplitude)

	return {
		T_mean_C,
		A1,
		A_night,
		eccAmplitude,
		LAPSE_RATE,
		tidalTd,
		redistribution,
		contrast,
	}
}

function computeTidalTemperature({
	mesh,
	elevation,
	landFraction,
	params,
	oceanDist,
	elevation_km,
}: ComputeTidalTemperatureParams): GenesisClimate {
	const N = mesh.numRegions
	const monthlyLibration = computeMonthlyLibration({
		eccentricity: params.eccentricity,
		perihelion: params.perihelion,
	})
	const monthlyDeclination = computeMonthlyLockedDeclination({
		obliquity: params.obliquity,
		eccentricity: params.eccentricity,
		perihelion: params.perihelion,
	})
	const daylight_hours_monthly = computeLockedMonthlyDaylightHours({
		mesh,
		params,
	})

	const { T_mean_C, A1, A_night, eccAmplitude, LAPSE_RATE, tidalTd, contrast } =
		computeTidalTransportParams(params)
	const KM_TO_MI = 0.621371

	const temperature_avg = new Float32Array(N)
	const temperature_min = new Float32Array(N)
	const temperature_max = new Float32Array(N)
	const temperature_monthly = new Float32Array(N * 12)
	const temperature_monthly_nolapse = new Float32Array(N * 12)
	const temperature_monthly_range = new Float32Array(N * 12)
	const insolation_monthly = new Float32Array(N * 12)
	const pet_monthly = new Float32Array(N * 12)

	const monthlyFlux = computeMonthlyOrbitalFlux(params)

	for (let r = 0; r < N; r++) {
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]

		for (let month = 0; month < 12; month++) {
			const sub = getSubstellarDirWithOffsetAndDeclination({
				substellarLon: params.substellarLon,
				lonOffsetRad: monthlyLibration[month],
				declinationRad: monthlyDeclination[month],
			})
			const cosTheta = Math.max(
				-1,
				Math.min(1, x * sub[0] + y * sub[1] + z * sub[2]),
			)

			const P1 = cosTheta
			const nightFrac = (1 - cosTheta) / 2

			let T = T_mean_C + A1 * P1 + A_night * nightFrac

			const hKm = elevation_km
				? elevation_km[r]
				: ELEVATION.elevToHeightKm({ elev: elevation[r] })
			const lapseCorrection = hKm > 0 ? hKm * LAPSE_RATE : 0
			T -= lapseCorrection

			if (oceanDist) {
				const distMiles = oceanDist[r] * KM_TO_MI
				const inlandShift = Math.tanh((distMiles - 300) / 1000) * 2 * contrast
				T += cosTheta > 0 ? inlandShift : -inlandShift
			}

			const monthValue = T + eccAmplitude * Math.sin((month / 12) * 2 * Math.PI)
			temperature_monthly[month * N + r] = monthValue
			temperature_monthly_nolapse[month * N + r] = monthValue + lapseCorrection
			temperature_monthly_range[month * N + r] = tidalTd
			insolation_monthly[month * N + r] =
				monthlyFlux[month] * Math.max(0, cosTheta)
		}
	}

	TEMPERATURE_SHARED.applyTemperatureNoise({
		mesh,
		N,
		seed: params.seed ?? 0,
		temperature_monthly,
		temperature_monthly_nolapse,
		computeTaper: (...coordinates: [number, number, number, number]) => {
			const x = coordinates[1]
			const y = coordinates[2]
			const z = coordinates[3]
			let ct = -1
			for (let month = 0; month < 12; month++) {
				const baseSub = getSubstellarDirWithOffsetAndDeclination({
					substellarLon: params.substellarLon,
					lonOffsetRad: monthlyLibration[month],
					declinationRad: monthlyDeclination[month],
				})
				const monthCt = Math.max(
					-1,
					Math.min(1, x * baseSub[0] + y * baseSub[1] + z * baseSub[2]),
				)
				if (monthCt > ct) ct = monthCt
			}
			return Math.min(
				1 - Math.max(0, ct - 0.5) * 2,
				1 + Math.min(0, ct + 0.5) * 2,
			)
		},
		includeCell: () => true,
	})

	TEMPERATURE_SHARED.recomputeAnnualTemperatureStats({
		temperature_monthly,
		temperature_avg,
		temperature_min,
		temperature_max,
		N,
	})

	return {
		temperature_avg,
		temperature_min,
		temperature_max,
		temperature_monthly,
		temperature_monthly_nolapse,
		temperature_monthly_range,
		insolation_monthly,
		pet_monthly,
		daylight_hours_monthly,
		landFraction,
	}
}

export const HEAT = {
	computeDailyLockedOrbit,
	computeMonthlyLibration,
	computeLockedSubstellarDeclinationRad,
	computeMonthlyLockedDeclination,
	getSubstellarDirWithOffsetAndDeclination,
	computeLockedMonthlyDaylightHours,
	computeTidalTransportParams,
	computeTidalTemperature,
}
