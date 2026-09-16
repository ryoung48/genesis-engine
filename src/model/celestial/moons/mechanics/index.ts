import type {
	KeplerEquationInput,
	MoonPeriodBounds,
	MoonPeriodBoundsInput,
	MoonPeriodFromAxisInput,
	MoonPositionVectorInput,
	MoonSemiMajorAxisInput,
	OrbitalPosition,
	OrbitalPositionVector,
	RocheLimitInput,
} from "@/model/celestial/moons/mechanics/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { TIME } from "@/model/shared/time"

const TWO_PI = 2 * Math.PI

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

function keplerMoonPositionVector({
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

const tideLockToleranceHours = 1e-6

function derivePlanetMassKg(radiusKm: number): number {
	const r = radiusKm * 1000
	return ORBIT_BODY.earthMeanDensityKgM3 * (4 / 3) * Math.PI * r * r * r
}

function moonSemiMajorAxisM({
	moon,
	planetMassKg,
}: MoonSemiMajorAxisInput): number {
	const T = moon.orbitalPeriodDays * TIME.secondsPerDay
	return Math.cbrt(
		(ORBIT_BODY.gravitationalConstantM3KgS2 * planetMassKg * T * T) /
			(TWO_PI * TWO_PI),
	)
}

function moonOrbitalPeriodDaysFromSemiMajorAxisM({
	semiMajorAxisM,
	planetMassKg,
}: MoonPeriodFromAxisInput): number {
	const periodSeconds =
		TWO_PI *
		Math.sqrt(
			semiMajorAxisM ** 3 /
				(ORBIT_BODY.gravitationalConstantM3KgS2 * planetMassKg),
		)
	return periodSeconds / TIME.secondsPerDay
}

function rocheLimitM({
	planetRadiusM,
	moonMassKg,
	moonDiameterM,
}: RocheLimitInput): number {
	const moonRadiusM = moonDiameterM / 2
	const moonVol = (4 / 3) * Math.PI * moonRadiusM * moonRadiusM * moonRadiusM
	const moonDensity = moonMassKg / moonVol
	return (
		planetRadiusM *
		Math.cbrt((2 * ORBIT_BODY.earthMeanDensityKgM3) / moonDensity)
	)
}

function moonPeriodBoundsDay({
	moon,
	planetMassKg,
	starMassKg,
	planetRadiusKm,
	orbitalDistanceAU,
}: MoonPeriodBoundsInput): MoonPeriodBounds {
	const planetRadiusM = planetRadiusKm * 1000
	const moonDiameterM = moon.diameterKm * 1000
	const planetOrbitalDistanceM =
		orbitalDistanceAU * ORBIT_BODY.astronomicalUnitM
	const roche = rocheLimitM({
		planetRadiusM,
		moonMassKg: moon.massKg,
		moonDiameterM,
	})
	const hill = ORBIT_BODY.hillSphereM({
		planetOrbitalDistanceM,
		planetMassKg,
		starMassKg,
	})
	const maxStable = 0.5 * hill
	if (roche >= maxStable) return { minDays: 0, maxDays: 0, valid: false }
	const periodFromDist = (distM: number) =>
		(TWO_PI *
			Math.sqrt(
				(distM * distM * distM) /
					(ORBIT_BODY.gravitationalConstantM3KgS2 * planetMassKg),
			)) /
		TIME.secondsPerDay
	return {
		minDays: periodFromDist(roche * 1.5),
		maxDays: periodFromDist(maxStable),
		valid: true,
	}
}

function keplerMoonPosition({
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

function keplerMoonPositionCartesian({
	moon,
	semiMajorAxisM,
	t,
}: MoonPositionVectorInput): { x: number; y: number; z: number } {
	return keplerMoonPositionVector({ moon, semiMajorAxisM, t })
}

export const MECHANICS = {
	derivePlanetMassKg,
	moonSemiMajorAxisM,
	moonOrbitalPeriodDaysFromSemiMajorAxisM,
	rocheLimitM,
	moonPeriodBoundsDay,
	keplerMoonPosition,
	keplerMoonPositionCartesian,
	tideLockToleranceHours,
}
