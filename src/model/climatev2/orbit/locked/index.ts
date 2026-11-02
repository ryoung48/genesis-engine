import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { INSOLATION } from "@/model/climate/shared/insolation"
import type {
	LockedDeclinationParams,
	LockedMonthlyDaylightHoursParams,
	LockedStarRadiationParams,
	MonthlyLibrationParams,
	SubstellarDirectionParams,
} from "@/model/climatev2/orbit/locked/types"
import type { GenesisParams } from "@/model/pipelines/types"
import { TIME } from "@/model/shared/time"
import { UNITS } from "@/model/shared/units"

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
	const { SIGMA, R_SUN, AU } = INSOLATION.sun
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
	const equinoxOffsetRad = (40 * 2 * Math.PI) / TIME.constants.daysPerYear

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

	const flux = new Array<number>(TIME.constants.daysPerYear).fill(0)
	const libration = new Array<number>(TIME.constants.daysPerYear).fill(0)
	const solarLongitude = new Array<number>(TIME.constants.daysPerYear).fill(0)
	for (let day = 0; day < TIME.constants.daysPerYear; day++) {
		if (day !== 0) {
			meanL += (2 * PI) / TIME.constants.daysPerYear
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

export const CLIMATEV2_LOCKED_ORBIT = {
	computeMonthlyLibration,
	computeMonthlyLockedDeclination,
	computeMonthlyOrbitalFlux,
	getSubstellarDirWithOffsetAndDeclination,
	computeLockedMonthlyDaylightHours,
}
