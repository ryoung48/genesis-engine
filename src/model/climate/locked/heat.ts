import type { OrogenClimate, OrogenParams, SphereMesh } from "../.."
import { TIME } from "../../shared/time"
import { getSubstellarDir } from "../../shared/units"
import type { OrogenTerrainFeatures } from "../../types/tectonics"
import {
	applyTemperatureNoise,
	applyVolcanicTemperatureEffects,
	elevToHeightKm,
	recomputeAnnualTemperatureStats,
} from "../climate"
import { EMB_CONSTANTS } from "../ebm/constants"

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

export function computeDailyLockedOrbit(
	params: Pick<OrogenParams, "eccentricity" | "perihelion" | "sunTempFactor">,
): { flux: number[]; libration: number[] } {
	const { SIGMA, T_SUN, R_SUN, AU } = EMB_CONSTANTS.stellar
	const effectiveTSun = T_SUN * params.sunTempFactor
	const s0 =
		(SIGMA * Math.pow(effectiveTSun, 4) * Math.pow(R_SUN, 2)) / Math.pow(AU, 2)
	const ecc = params.eccentricity
	const PI = Math.PI
	const perihelionRad = (params.perihelion * Math.PI) / 180
	const longP = perihelionRad + PI
	const equinoxOffsetRad = (40 * 2 * Math.PI) / EMB_CONSTANTS.time.DAYS_PER_YEAR

	const calcEccFromTrue = (
		trueAnomaly: number,
		eccentricity: number,
	): number => {
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
	let eccA = calcEccFromTrue(trueA, ecc)
	let meanL = eccA - ecc * Math.sin(eccA) + longP

	const flux = new Array<number>(EMB_CONSTANTS.time.DAYS_PER_YEAR).fill(0)
	const libration = new Array<number>(EMB_CONSTANTS.time.DAYS_PER_YEAR).fill(0)
	for (let day = 0; day < EMB_CONSTANTS.time.DAYS_PER_YEAR; day++) {
		if (day !== 0) {
			meanL += (2 * PI) / EMB_CONSTANTS.time.DAYS_PER_YEAR
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

		const meanA = meanL - longP
		let lib = trueA - meanA
		while (lib > PI) lib -= 2 * PI
		while (lib < -PI) lib += 2 * PI
		libration[day] = lib
	}

	return { flux, libration }
}

/**
 * Compute monthly substellar longitude offset due to optical libration
 * in eccentric synchronous rotation: λ_⋆(t) ≈ ν(t) - M(t)
 */
export function computeMonthlyLibration(
	eccentricity: number,
	perihelion: number,
): number[] {
	const ecc = eccentricity
	if (ecc < 1e-6) return new Array(12).fill(0)

	const { libration } = computeDailyLockedOrbit({
		eccentricity,
		perihelion,
		sunTempFactor: 1,
	})
	return Array.from({ length: 12 }, (_, month) => {
		const days = TIME.month.days(month)
		return (
			days.reduce((sum, day) => sum + libration[day], 0) /
			Math.max(1, days.length)
		)
	})
}

/** Unit vector for substellar point with a longitude offset (radians). */
export function getSubstellarDirWithOffset(
	antistellarLon: number,
	lonOffsetRad: number,
): [number, number, number] {
	const subRad = ((antistellarLon + 180) % 360) * (Math.PI / 180) + lonOffsetRad
	return [Math.cos(subRad), Math.sin(subRad), 0]
}

function computeMonthlyOrbitalFlux(params: OrogenParams): number[] {
	const { flux } = computeDailyLockedOrbit(params)
	return Array.from({ length: 12 }, (_, month) => {
		const days = TIME.month.days(month)
		return (
			days.reduce((sum, day) => sum + flux[day], 0) / Math.max(1, days.length)
		)
	})
}

export function computeLockedMonthlyDaylightHours(
	mesh: SphereMesh,
	params: Pick<
		OrogenParams,
		"antistellarLon" | "eccentricity" | "hoursPerDay" | "perihelion"
	>,
): Float32Array {
	const N = mesh.numRegions
	const monthly = new Float32Array(N * 12)
	const monthlyLibration = computeMonthlyLibration(
		params.eccentricity,
		params.perihelion,
	)
	for (let month = 0; month < 12; month++) {
		const sub = getSubstellarDirWithOffset(
			params.antistellarLon,
			monthlyLibration[month],
		)
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

interface TidalTransportParams {
	T_mean_C: number
	A1: number
	A_night: number
	eccAmplitude: number
	LAPSE_RATE: number
	tidalTd: number
	redistribution: number
	contrast: number
}

export function computeTidalTransportParams(
	params: Pick<
		OrogenParams,
		| "daysPerYear"
		| "eccentricity"
		| "planetRadiusKm"
		| "pressure"
		| "sunTempFactor"
	>,
): TidalTransportParams {
	const radiusM = params.planetRadiusKm * 1000
	const pressure = params.pressure ?? 1.0
	const ecc = params.eccentricity
	const sunFactor = params.sunTempFactor

	const { SIGMA, T_SUN, R_SUN, AU } = EMB_CONSTANTS.stellar
	const effectiveTSun = T_SUN * sunFactor
	const S0 =
		(SIGMA * Math.pow(effectiveTSun, 4) * Math.pow(R_SUN, 2)) / Math.pow(AU, 2)
	const albedo = 0.3
	const T_eq = Math.pow((S0 * (1 - albedo)) / (4 * SIGMA), 0.25)
	const GREENHOUSE_OFFSET = 33
	const T_mean_C = T_eq - 273.15 + GREENHOUSE_OFFSET

	const radiusRatio = EMB_CONSTANTS.planet.EARTH_RADIUS / radiusM
	const radiusFactor = radiusRatio * radiusRatio
	const pressureFactor = Math.pow(pressure, 0.5)
	const yearFactor = Math.pow(
		params.daysPerYear / EMB_CONSTANTS.time.DAYS_PER_YEAR,
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

/**
 * Compute per-cell temperature for a tidally locked planet using a
 * Legendre polynomial expansion around the substellar point.
 *
 * T(θ) = T_mean + A₁·P₁(cosθ) + A₂·P₂(cosθ)
 *
 * where θ is angular distance from the substellar point. Redistribution
 * factor controls how uniform temperatures are (1 = perfectly uniform,
 * 0 = no heat redistribution).
 */
export function computeTidalTemperature(
	mesh: SphereMesh,
	elevation: Float32Array,
	landFraction: number[],
	params: OrogenParams,
	oceanDist?: Float32Array,
	elevation_km?: Float32Array,
	hotspot?: Float32Array,
	mantleUpwelling?: Float32Array,
	terrainFeatures?: OrogenTerrainFeatures,
): OrogenClimate {
	const N = mesh.numRegions
	const monthlyLibration = computeMonthlyLibration(
		params.eccentricity,
		params.perihelion,
	)
	const daylight_hours_monthly = computeLockedMonthlyDaylightHours(mesh, params)

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
			const sub = getSubstellarDirWithOffset(
				params.antistellarLon,
				monthlyLibration[month],
			)
			const cosTheta = Math.max(
				-1,
				Math.min(1, x * sub[0] + y * sub[1] + z * sub[2]),
			)

			const P1 = cosTheta
			const nightFrac = (1 - cosTheta) / 2

			let T = T_mean_C + A1 * P1 + A_night * nightFrac

			const hKm = elevation_km ? elevation_km[r] : elevToHeightKm(elevation[r])
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

	applyTemperatureNoise(
		mesh,
		N,
		params.seed ?? 0,
		temperature_monthly,
		temperature_monthly_nolapse,
		(_r, x, y, z) => {
			const baseSub = getSubstellarDir(params.antistellarLon)
			const ct = Math.max(
				-1,
				Math.min(1, x * baseSub[0] + y * baseSub[1] + z * baseSub[2]),
			)
			return Math.min(
				1 - Math.max(0, ct - 0.5) * 2,
				1 + Math.min(0, ct + 0.5) * 2,
			)
		},
		() => true,
	)
	applyVolcanicTemperatureEffects({
		mesh,
		params,
		temperature_monthly,
		temperature_monthly_nolapse,
		hotspot,
		mantleUpwelling,
		terrainFeatures,
	})

	const insolationMul = params.insolationFactor ?? 1
	for (let i = 0; i < insolation_monthly.length; i++) {
		insolation_monthly[i] *= insolationMul
	}

	recomputeAnnualTemperatureStats(
		temperature_monthly,
		temperature_avg,
		temperature_min,
		temperature_max,
		N,
	)

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
