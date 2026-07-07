import { AU_M, M_SOL_KG } from "../celestial/moons/orbital-mechanics"
import {
	getStarMassSol,
	type MainSequenceClass,
} from "../celestial/star/star-types"

const TWO_PI = 2 * Math.PI

function p2(cosX: number): number {
	return (3 * cosX * cosX - 1) / 2
}

function angularSeparationCos(
	bodyLatRad: number,
	bodyLonRad: number,
	surfaceLatRad: number,
	surfaceLonRad: number,
): number {
	return (
		Math.sin(surfaceLatRad) * Math.sin(bodyLatRad) +
		Math.cos(surfaceLatRad) *
			Math.cos(bodyLatRad) *
			Math.cos(bodyLonRad - surfaceLonRad)
	)
}

export function tideContribution(
	bodyLatRad: number,
	bodyLonRad: number,
	bodyDistanceM: number,
	bodyMassKg: number,
	surfaceLatRad: number,
	surfaceLonRad: number,
	planetMassKg: number,
	planetRadiusM: number,
): number {
	const cosPsi = angularSeparationCos(
		bodyLatRad,
		bodyLonRad,
		surfaceLatRad,
		surfaceLonRad,
	)
	const R = planetRadiusM
	const C =
		(bodyMassKg / planetMassKg) *
		((R * R * R * R) / (bodyDistanceM * bodyDistanceM * bodyDistanceM))
	return C * p2(cosPsi)
}

// Peak (sub-point, P2(cos0)=1) tide-raising amplitude one moon induces on
// another, using the same equilibrium-tide formula as tideContribution() but
// with the raised moon's own radius/mass standing in for the planet's. Unlike
// the planet-surface tides above, we don't track a fixed observation point on
// either moon's surface -- the bulge always points at the other moon, so its
// peak height is just the sub-point value at the current separation.
export function moonMoonTideContribution(
	raisedMoonRadiusM: number,
	raisedMoonMassKg: number,
	raisingMoonMassKg: number,
	separationM: number,
): number {
	return (
		(raisingMoonMassKg / raisedMoonMassKg) *
		(raisedMoonRadiusM ** 4 / separationM ** 3)
	)
}

interface StarTidalPosition {
	latRad: number
	lonRad: number
	distanceM: number
}

export function starTidalPosition(
	orbitalDistanceAU: number,
	planetEccentricity: number,
	perihelionLonDeg: number,
	t: number,
	daysPerYear: number,
): StarTidalPosition {
	// Mean anomaly of planet around star
	const M = TWO_PI * (t / daysPerYear)
	// Eccentric anomaly via Newton-Raphson
	let E = M
	for (let i = 0; i < 10; i++) {
		const dE =
			(E - planetEccentricity * Math.sin(E) - M) /
			(1 - planetEccentricity * Math.cos(E))
		E -= dE
		if (Math.abs(dE) < 1e-10) break
	}
	const nu =
		2 *
		Math.atan2(
			Math.sqrt(1 + planetEccentricity) * Math.sin(E / 2),
			Math.sqrt(1 - planetEccentricity) * Math.cos(E / 2),
		)
	const a = orbitalDistanceAU * AU_M
	const r =
		(a * (1 - planetEccentricity * planetEccentricity)) /
		(1 + planetEccentricity * Math.cos(nu))

	// Sub-star longitude: star appears opposite to planet's orbital position
	// The planet rotates, shifting the sub-star longitude by t full rotations
	const periRad = (perihelionLonDeg * Math.PI) / 180
	const lonRaw = Math.PI + nu + periRad - TWO_PI * (t % 1)
	const lonRad = ((lonRaw % TWO_PI) + TWO_PI) % TWO_PI

	// Star is always near equatorial plane (ecliptic ≈ equatorial for simplicity)
	return { latRad: 0, lonRad, distanceM: r }
}

export function starTideContribution(
	starLatRad: number,
	starLonRad: number,
	starDistanceM: number,
	spectralClass: MainSequenceClass,
	starSubtype: number,
	surfaceLatRad: number,
	surfaceLonRad: number,
	planetMassKg: number,
	planetRadiusM: number,
): number {
	const starMassKg = getStarMassSol(spectralClass, starSubtype) * M_SOL_KG
	return tideContribution(
		starLatRad,
		starLonRad,
		starDistanceM,
		starMassKg,
		surfaceLatRad,
		surfaceLonRad,
		planetMassKg,
		planetRadiusM,
	)
}

// Earth-Moon reference tidal scale at equator (lat=0, lon=0, moon overhead)
// C_earth = (M_moon / M_earth) × (R_earth^4 / d_moon^3)
// P2(cos 0) = 1
const EARTH_MOON_MASS_KG = 7.34e22
const EARTH_MASS_KG = 5.973886146404331e24
const EARTH_RADIUS_M = 6.371e6
const EARTH_MOON_DIST_M = 3.844e8

export const EARTH_MOON_TIDE_REFERENCE =
	(EARTH_MOON_MASS_KG / EARTH_MASS_KG) *
	(EARTH_RADIUS_M ** 4 / EARTH_MOON_DIST_M ** 3) *
	p2(1)

export function apparentDiameterRad(
	bodyDiameterM: number,
	distanceM: number,
): number {
	return bodyDiameterM / distanceM
}
