import {
	ASTRONOMICAL_UNIT_M,
	EARTH_MASS_KG,
	EARTH_RADIUS_M,
	SOLAR_MASS_KG,
} from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import type {
	StarTidalPosition,
	TideContributionParams,
	MoonMoonTideContributionParams,
	StarTidalPositionParams,
	StarTideContributionParams,
	ApparentDiameterRadParams,
} from "@/model/climate/tidal-force/types"

const TWO_PI = 2 * Math.PI

function p2(cosX: number): number {
	return (3 * cosX * cosX - 1) / 2
}

function angularSeparationCos({
	bodyLatRad,
	bodyLonRad,
	surfaceLatRad,
	surfaceLonRad,
}: Pick<
	TideContributionParams,
	"bodyLatRad" | "bodyLonRad" | "surfaceLatRad" | "surfaceLonRad"
>): number {
	return (
		Math.sin(surfaceLatRad) * Math.sin(bodyLatRad) +
		Math.cos(surfaceLatRad) *
			Math.cos(bodyLatRad) *
			Math.cos(bodyLonRad - surfaceLonRad)
	)
}

function tideContribution({
	bodyLatRad,
	bodyLonRad,
	bodyDistanceM,
	bodyMassKg,
	surfaceLatRad,
	surfaceLonRad,
	planetMassKg,
	planetRadiusM,
}: TideContributionParams): number {
	const cosPsi = angularSeparationCos({
		bodyLatRad,
		bodyLonRad,
		surfaceLatRad,
		surfaceLonRad,
	})
	const R = planetRadiusM
	const C =
		(bodyMassKg / planetMassKg) *
		((R * R * R * R) / (bodyDistanceM * bodyDistanceM * bodyDistanceM))
	return C * p2(cosPsi)
}

function moonMoonTideContribution({
	raisedMoonRadiusM,
	raisedMoonMassKg,
	raisingMoonMassKg,
	separationM,
}: MoonMoonTideContributionParams): number {
	return (
		(raisingMoonMassKg / raisedMoonMassKg) *
		(raisedMoonRadiusM ** 4 / separationM ** 3)
	)
}

function starTidalPosition({
	orbitalDistanceAU,
	planetEccentricity,
	perihelionLonDeg,
	t,
	daysPerYear,
}: StarTidalPositionParams): StarTidalPosition {
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
	const a = orbitalDistanceAU * ASTRONOMICAL_UNIT_M
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

function starTideContribution({
	starLatRad,
	starLonRad,
	starDistanceM,
	spectralClass,
	starSubtype,
	surfaceLatRad,
	surfaceLonRad,
	planetMassKg,
	planetRadiusM,
}: StarTideContributionParams): number {
	const starMassKg =
		STAR.getStarMassSol({ cls: spectralClass, subtype: starSubtype }) *
		SOLAR_MASS_KG
	return tideContribution({
		bodyLatRad: starLatRad,
		bodyLonRad: starLonRad,
		bodyDistanceM: starDistanceM,
		bodyMassKg: starMassKg,
		surfaceLatRad,
		surfaceLonRad,
		planetMassKg,
		planetRadiusM,
	})
}

const EARTH_MOON_MASS_KG = 7.34e22

const EARTH_MOON_DIST_M = 3.844e8

const earthMoonTideReference =
	(EARTH_MOON_MASS_KG / EARTH_MASS_KG) *
	(EARTH_RADIUS_M ** 4 / EARTH_MOON_DIST_M ** 3) *
	p2(1)

function apparentDiameterRad({
	bodyDiameterM,
	distanceM,
}: ApparentDiameterRadParams): number {
	return bodyDiameterM / distanceM
}

export const TIDAL_FORCE = {
	earthMoonTideReference,
	tideContribution,
	moonMoonTideContribution,
	starTidalPosition,
	starTideContribution,
	apparentDiameterRad,
}
