import { STAR } from "@/model/celestial/star"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import type { Sunlight } from "@/model/climate/classification/climate/types"
import { CLIMATEV2_LOCKED_ORBIT } from "@/model/climatev2/orbit/locked"
import type {
	ClimateV2OrbitParams,
	LockedSunlightParams,
	SolarHoursParams,
	StarLightParams,
} from "@/model/climatev2/orbit/types"
import {
	type ClimateOrbit,
	EARTH_ROTATION,
} from "@/model/climatev2/vendor/insolation.js"
import type { GenesisParams } from "@/model/pipelines/types"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"

// A near-locked planet's solar day is held to this many sidereal days (a locked one goes to our own climate).
const MAX_SOLAR_PER_SIDEREAL = 1000
// Surface pressure (bar) is held to ExoPlaSim's usable range, the span climatev2's pressure scalings are fitted on
// (Worldbuilding Pasta 2025, "Climate Explorations: Pressure")
const PRESSURE_RANGE_BAR = { lo: 0.1, hi: 10 }
const SECONDS_PER_EARTH_YEAR = 3.156e7

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
		pressureScale:
			MATH.clamp({ value: params.pressure ?? 1, ...PRESSURE_RANGE_BAR }) /
			earth.pressureBar,
		locked: null,
	}
}

// A planet locked to its star turns once a year, and its sun stands still but for libration and the tilt's slow nod.
function lockedFromParams(params: GenesisParams): ClimateOrbit {
	const orbit = fromParams(params)
	const { eccentricity, perihelion, obliquity } = params
	return {
		...orbit,
		rotationRateRadS:
			(2 * Math.PI) / (orbit.yearScale * SECONDS_PER_EARTH_YEAR),
		solarDayScale: 1,
		locked: {
			substellarLon: params.substellarLon,
			libration: CLIMATEV2_LOCKED_ORBIT.computeMonthlyLibration({
				eccentricity,
				perihelion,
			}),
			declination: CLIMATEV2_LOCKED_ORBIT.computeMonthlyLockedDeclination({
				obliquity,
				eccentricity,
				perihelion,
			}),
			flux: CLIMATEV2_LOCKED_ORBIT.computeMonthlyOrbitalFlux(params),
		},
	}
}

// A locked planet's sunlight by month: daylight, the starlight at each cell's angle from the substellar point
// (libration, declination and the orbit's flux), and the substellar latitude
function lockedSunlight({ mesh, params }: LockedSunlightParams): Sunlight {
	const N = mesh.numRegions
	const { eccentricity, perihelion, obliquity } = params
	const libration = CLIMATEV2_LOCKED_ORBIT.computeMonthlyLibration({
		eccentricity,
		perihelion,
	})
	const declination = CLIMATEV2_LOCKED_ORBIT.computeMonthlyLockedDeclination({
		obliquity,
		eccentricity,
		perihelion,
	})
	const flux = CLIMATEV2_LOCKED_ORBIT.computeMonthlyOrbitalFlux(params)
	const insolation_monthly = new Float32Array(12 * N)
	for (let month = 0; month < 12; month++) {
		const [sx, sy, sz] =
			CLIMATEV2_LOCKED_ORBIT.getSubstellarDirWithOffsetAndDeclination({
				substellarLon: params.substellarLon,
				lonOffsetRad: libration[month],
				declinationRad: declination[month],
			})
		for (let r = 0; r < N; r++) {
			const cosTheta =
				mesh.r_xyz[3 * r] * sx +
				mesh.r_xyz[3 * r + 1] * sy +
				mesh.r_xyz[3 * r + 2] * sz
			insolation_monthly[month * N + r] = flux[month] * Math.max(0, cosTheta)
		}
	}
	return {
		daylight_hours_monthly:
			CLIMATEV2_LOCKED_ORBIT.computeLockedMonthlyDaylightHours({
				mesh,
				params,
			}),
		insolation_monthly,
		declination_monthly: Float32Array.from(
			declination,
			(rad) => (rad * 180) / Math.PI,
		),
	}
}

export const CLIMATEV2_ORBIT = { fromParams, lockedFromParams, lockedSunlight }
