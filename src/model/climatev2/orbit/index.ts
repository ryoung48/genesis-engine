import { STAR } from "@/model/celestial/star"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import type {
	ClimateV2OrbitParams,
	SolarHoursParams,
	StarLightParams,
} from "@/model/climatev2/orbit/types"
import {
	type ClimateOrbit,
	EARTH_ROTATION,
} from "@/model/climatev2/vendor/insolation.js"
import { UNITS } from "@/model/shared/units"

// A near-locked planet's solar day is held to this many sidereal days (a locked one goes to our own climate).
const MAX_SOLAR_PER_SIDEREAL = 1000

// hoursPerDay is the sidereal rotation period and the year is daysPerYear of those; the solar day adds (retrograde:
// removes) one turn per year. All are scaled from Earth's so that Earth gives climatev2's own constants exactly.
function solarHours(params: SolarHoursParams): number {
	const turn = UNITS.isRetrogradeObliquity(params.obliquity) ? -1 : 1
	const slip = Math.max(
		1 / MAX_SOLAR_PER_SIDEREAL,
		Math.abs(1 - turn / params.daysPerYear),
	)
	return params.hoursPerDay / slip
}

// The sunlight at the orbit, σT⁴(R/d)² — the star's temperature and radius by its spectral class and subtype, as our
// own energy balance takes them (classification/climate ebmConfig) — up to the constant σ, which the ratio drops.
function starLight(params: StarLightParams): number {
	const cls = STAR.isValidSpectralClass(params.spectralClass)
		? params.spectralClass
		: "G"
	const star = { cls, subtype: params.starSubtype }
	return (
		(STAR.getStarTemperatureK(star) ** 4 * STAR.getStarDiameterSol(star) ** 2) /
		params.orbitalDistanceAU ** 2
	)
}

// Sol's, at 1 AU: a G2 star (the pipeline's default star)
const SOL_LIGHT = starLight({
	spectralClass: "G",
	starSubtype: 2,
	orbitalDistanceAU: SOL_SYSTEM.solMainWorldDefaults.orbitalDistanceAU,
})

function fromParams(params: ClimateV2OrbitParams): ClimateOrbit {
	const { hoursPerDay, daysPerYear } = params
	const earth = SOL_SYSTEM.solMainWorldDefaults
	const radiusScale = params.planetRadiusKm / earth.planetRadiusKm
	return {
		tiltDeg: UNITS.getEffectiveObliquityDeg(params.obliquity),
		eccentricity: params.eccentricity,
		perihelion: params.perihelion,
		rotationRateRadS: EARTH_ROTATION * (earth.hoursPerDay / hoursPerDay),
		yearScale:
			(daysPerYear * hoursPerDay) / (earth.daysPerYear * earth.hoursPerDay),
		solarDayScale: solarHours(params) / solarHours(earth),
		sunScale: starLight(params) / SOL_LIGHT,
		radiusScale,
		// Earth's density, as our own climate takes it (classification/climate gravityRatio)
		gravityScale: radiusScale,
	}
}

export const CLIMATEV2_ORBIT = { fromParams }
