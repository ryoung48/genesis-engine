import { SECONDS_PER_DAY } from "../../../shared"
import {
	ASTRONOMICAL_UNIT_M,
	EARTH_MEAN_DENSITY_KG_M3,
	GRAVITATIONAL_CONSTANT_M3_KG_S2,
} from "../../orbit-body"
import type {
	HillSphereInput,
	KeplerEquationInput,
	MoonPeriodBoundsInput,
	MoonPeriodFromAxisInput,
	MoonPositionVectorInput,
	MoonSemiMajorAxisInput,
	RocheLimitInput,
} from "./types"

const TWO_PI = 2 * Math.PI
export function hillSphereM({
	planetOrbitalDistanceM,
	planetMassKg,
	starMassKg,
}: HillSphereInput): number {
	return planetOrbitalDistanceM * Math.cbrt(planetMassKg / (3 * starMassKg))
}

function solveKeplersEquation({
	meanAnomalyRad,
	eccentricity,
}: KeplerEquationInput): number {
	let E = meanAnomalyRad
	for (let i = 0; i < 10; i++) {
		const dE =
			(E - eccentricity * Math.sin(E) - meanAnomalyRad) /
			(1 - eccentricity * Math.cos(E))
		E -= dE
		if (Math.abs(dE) < 1e-10) break
	}
	return E
}

interface OrbitalPositionVector {
	x: number
	y: number
	z: number
	distanceM: number
	trueAnomalyRad: number
}

export function keplerMoonPositionVector({
	moon,
	semiMajorAxisM,
	t,
}: MoonPositionVectorInput): OrbitalPositionVector {
	const M0 = (moon.meanAnomalyAtEpochDeg * Math.PI) / 180
	const M = M0 + TWO_PI * (t / moon.orbitalPeriodDays)
	const Mnorm = ((M % TWO_PI) + TWO_PI) % TWO_PI

	const E = solveKeplersEquation({
		meanAnomalyRad: Mnorm,
		eccentricity: moon.eccentricity,
	})

	const nu =
		2 *
		Math.atan2(
			Math.sqrt(1 + moon.eccentricity) * Math.sin(E / 2),
			Math.sqrt(1 - moon.eccentricity) * Math.cos(E / 2),
		)

	const r =
		(semiMajorAxisM * (1 - moon.eccentricity * moon.eccentricity)) /
		(1 + moon.eccentricity * Math.cos(nu))

	// Position in orbital plane (perifocal)
	const xOrb = r * Math.cos(nu)
	const yOrb = r * Math.sin(nu)

	// Euler rotations: ω (arg of periapsis), i (inclination), Ω (lon of ascending node)
	const omega = (moon.longitudeOfPerihelionDeg * Math.PI) / 180
	const inc = (moon.inclinationDeg * Math.PI) / 180
	const Omega = (moon.longitudeOfAscendingNodeDeg * Math.PI) / 180

	const cosO = Math.cos(Omega),
		sinO = Math.sin(Omega)
	const coso = Math.cos(omega),
		sino = Math.sin(omega)
	const cosI = Math.cos(inc),
		sinI = Math.sin(inc)

	// Rotation matrix columns (perifocal → equatorial)
	const x =
		(cosO * coso - sinO * sino * cosI) * xOrb +
		(-cosO * sino - sinO * coso * cosI) * yOrb
	const y =
		(sinO * coso + cosO * sino * cosI) * xOrb +
		(-sinO * sino + cosO * coso * cosI) * yOrb
	const z = sino * sinI * xOrb + coso * sinI * yOrb

	return { x, y, z, distanceM: r, trueAnomalyRad: nu }
}

export const TIDE_LOCK_TOLERANCE_HOURS = 1e-6

export interface MoonPeriodBounds {
	minDays: number
	maxDays: number
	valid: boolean
}

export interface OrbitalPosition {
	latRad: number
	lonRad: number
	distanceM: number
	trueAnomalyRad: number
}

export function derivePlanetMassKg(radiusKm: number): number {
	const r = radiusKm * 1000
	return EARTH_MEAN_DENSITY_KG_M3 * (4 / 3) * Math.PI * r * r * r
}

export function moonSemiMajorAxisM({
	moon,
	planetMassKg,
}: MoonSemiMajorAxisInput): number {
	const T = moon.orbitalPeriodDays * SECONDS_PER_DAY
	return Math.cbrt(
		(GRAVITATIONAL_CONSTANT_M3_KG_S2 * planetMassKg * T * T) /
			(TWO_PI * TWO_PI),
	)
}

export function moonOrbitalPeriodDaysFromSemiMajorAxisM({
	semiMajorAxisM,
	planetMassKg,
}: MoonPeriodFromAxisInput): number {
	const periodSeconds =
		TWO_PI *
		Math.sqrt(
			semiMajorAxisM ** 3 / (GRAVITATIONAL_CONSTANT_M3_KG_S2 * planetMassKg),
		)
	return periodSeconds / SECONDS_PER_DAY
}

export function rocheLimitM({
	planetRadiusM,
	moonMassKg,
	moonDiameterM,
}: RocheLimitInput): number {
	const moonRadiusM = moonDiameterM / 2
	const moonVol = (4 / 3) * Math.PI * moonRadiusM * moonRadiusM * moonRadiusM
	const moonDensity = moonMassKg / moonVol
	return planetRadiusM * Math.cbrt((2 * EARTH_MEAN_DENSITY_KG_M3) / moonDensity)
}

export function moonPeriodBoundsDay({
	moon,
	planetMassKg,
	starMassKg,
	planetRadiusKm,
	orbitalDistanceAU,
}: MoonPeriodBoundsInput): MoonPeriodBounds {
	const planetRadiusM = planetRadiusKm * 1000
	const moonDiameterM = moon.diameterKm * 1000
	const planetOrbitalDistanceM = orbitalDistanceAU * ASTRONOMICAL_UNIT_M
	const roche = rocheLimitM({
		planetRadiusM,
		moonMassKg: moon.massKg,
		moonDiameterM,
	})
	const hill = hillSphereM({ planetOrbitalDistanceM, planetMassKg, starMassKg })
	const maxStable = 0.5 * hill
	if (roche >= maxStable) return { minDays: 0, maxDays: 0, valid: false }
	const periodFromDist = (distM: number) =>
		(TWO_PI *
			Math.sqrt(
				(distM * distM * distM) /
					(GRAVITATIONAL_CONSTANT_M3_KG_S2 * planetMassKg),
			)) /
		SECONDS_PER_DAY
	return {
		minDays: periodFromDist(roche * 1.5),
		maxDays: periodFromDist(maxStable),
		valid: true,
	}
}

export function keplerMoonPosition({
	moon,
	semiMajorAxisM,
	t,
}: MoonPositionVectorInput): OrbitalPosition {
	const vector = keplerMoonPositionVector({ moon, semiMajorAxisM, t })
	const planetRotationRad = TWO_PI * (t % 1)
	const lonRaw = Math.atan2(vector.y, vector.x) - planetRotationRad
	const lonRad = ((lonRaw % TWO_PI) + TWO_PI) % TWO_PI
	const latRad = Math.asin(vector.z / vector.distanceM)
	return {
		latRad,
		lonRad,
		distanceM: vector.distanceM,
		trueAnomalyRad: vector.trueAnomalyRad,
	}
}

export function keplerMoonPositionCartesian({
	moon,
	semiMajorAxisM,
	t,
}: MoonPositionVectorInput): { x: number; y: number; z: number } {
	return keplerMoonPositionVector({ moon, semiMajorAxisM, t })
}
