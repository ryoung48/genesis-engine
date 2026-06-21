import type { MoonParams } from "../celestial/moons/moon-types"
import {
	derivePlanetMassKg,
	keplerMoonPosition,
	M_SOL_KG,
	moonPeriodBoundsDay,
	moonSemiMajorAxisM,
	rocheLimitM,
} from "../celestial/moons/orbital-mechanics"
import type { MainSequenceClass } from "../celestial/star/star-types"
import {
	DEFAULT_SPECTRAL_CLASS,
	getStarDiameterSol,
	getStarMassSol,
	isValidSpectralClass,
} from "../celestial/star/star-types"
import type { GenesisParams } from "../types/tectonics"
import {
	apparentDiameterRad,
	EARTH_MOON_TIDE_REFERENCE,
	starTidalPosition,
	starTideContribution,
	tideContribution,
} from "./tidal-force"

type EclipseType = "solar-total" | "solar-annular" | "lunar" | "none"

interface TidalEvent {
	dayOfYear: number
	tidalForce: number
	moonForces: number[]
	starForce: number
	moonPhases: number[]
	eclipseType: EclipseType
}

export interface TidalSchedule {
	events: TidalEvent[]
	maxForce: number
	minForce: number
	moonsClamped: boolean
}

// Star diameter in metres (for eclipse apparent size comparison)
function starDiameterM(spectralClass: string, starSubtype: number): number {
	const cls = isValidSpectralClass(spectralClass)
		? spectralClass
		: DEFAULT_SPECTRAL_CLASS
	return getStarDiameterSol(cls as MainSequenceClass, starSubtype) * 1.392e9
}

// Clamp moon orbital period to valid bounds and return adjusted moon + clamped flag
function validateMoon(
	moon: MoonParams,
	planetMassKg: number,
	starMassKg: number,
	planetRadiusKm: number,
	orbitalDistanceAU: number,
	hoursPerDay: number,
): { moon: MoonParams; clamped: boolean } {
	const bounds = moonPeriodBoundsDay(
		moon,
		planetMassKg,
		starMassKg,
		planetRadiusKm,
		orbitalDistanceAU,
		hoursPerDay,
	)
	if (!bounds.valid) {
		return { moon: { ...moon, orbitalPeriodDays: 0 }, clamped: true }
	}

	let clamped = false
	let { orbitalPeriodDays, eccentricity } = moon

	if (orbitalPeriodDays < bounds.minDays) {
		orbitalPeriodDays = bounds.minDays
		clamped = true
	} else if (orbitalPeriodDays > bounds.maxDays) {
		orbitalPeriodDays = bounds.maxDays
		clamped = true
	}

	// Recompute semi-major axis after period clamp to validate eccentricity
	const a = moonSemiMajorAxisM(
		{ ...moon, orbitalPeriodDays },
		planetMassKg,
		hoursPerDay,
	)
	const planetRadiusM = planetRadiusKm * 1000
	const moonDiameterM = moon.diameterKm * 1000
	const roche = rocheLimitM(planetRadiusM, moon.massKg, moonDiameterM)
	const eMax = Math.max(0, 1 - roche / a)
	if (eccentricity > eMax) {
		eccentricity = eMax * 0.9
		clamped = true
	}

	return { moon: { ...moon, orbitalPeriodDays, eccentricity }, clamped }
}

// Moon phase: illuminated fraction as seen from planet
// Phase angle α = angle at moon between planet and star directions
function moonIlluminatedFraction(
	moonLatRad: number,
	moonLonRad: number,
	starLatRad: number,
	starLonRad: number,
): number {
	// cos α = dot product of unit vectors from planet to moon and planet to star
	const cosMoon = Math.cos(moonLatRad)
	const mx = cosMoon * Math.cos(moonLonRad)
	const my = cosMoon * Math.sin(moonLonRad)
	const mz = Math.sin(moonLatRad)

	const cosStar = Math.cos(starLatRad)
	const sx = cosStar * Math.cos(starLonRad)
	const sy = cosStar * Math.sin(starLonRad)
	const sz = Math.sin(starLatRad)

	// Angle at moon between planet (origin) and star
	// The star direction from the moon is approximately the same as star direction from planet
	// (star is ~1 AU away, moon is <0.01 AU away — negligible parallax)
	const cosAlpha = mx * sx + my * sy + mz * sz
	return (1 - cosAlpha) / 2
}

// Eclipse detection: checks alignment of moon/star at a node
function detectEclipse(
	moonLatRad: number,
	moonLonRad: number,
	moonDistanceM: number,
	moonDiameterM: number,
	starLatRad: number,
	starLonRad: number,
	starDistM: number,
	starDiamM: number,
	phase: number,
): EclipseType {
	// Solar eclipse: new moon (phase ≈ 0) + moon near ecliptic (near star direction)
	// Lunar eclipse: full moon (phase ≈ 1) + moon opposite star
	const isNew = phase < 0.05
	const isFull = phase > 0.95

	if (!isNew && !isFull) return "none"

	// Angular separation between moon and star (new) or moon and anti-star (full)
	const cosMoon = Math.cos(moonLatRad)
	const mx = cosMoon * Math.cos(moonLonRad)
	const my = cosMoon * Math.sin(moonLonRad)
	const mz = Math.sin(moonLatRad)

	const cosStar = Math.cos(starLatRad)
	const sx = cosStar * Math.cos(starLonRad)
	const sy = cosStar * Math.sin(starLonRad)
	const sz = Math.sin(starLatRad)

	const dotMoonStar = mx * sx + my * sy + mz * sz

	if (isNew && dotMoonStar > 0.9998) {
		// Moon between planet and star — solar eclipse
		const moonApp = apparentDiameterRad(moonDiameterM, moonDistanceM)
		const starApp = apparentDiameterRad(starDiamM, starDistM)
		return moonApp >= starApp ? "solar-total" : "solar-annular"
	}

	if (isFull && dotMoonStar < -0.9998) {
		// Moon in planet's shadow — lunar eclipse
		return "lunar"
	}

	return "none"
}

export function computeTidalSchedule(
	moons: MoonParams[],
	params: Pick<
		GenesisParams,
		| "seed"
		| "daysPerYear"
		| "hoursPerDay"
		| "planetRadiusKm"
		| "tideLock"
		| "spectralClass"
		| "starSubtype"
		| "orbitalDistanceAU"
		| "eccentricity"
		| "perihelion"
	>,
): TidalSchedule {
	const {
		daysPerYear,
		hoursPerDay,
		planetRadiusKm,
		tideLock,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		perihelion,
	} = params

	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const planetRadiusM = planetRadiusKm * 1000
	const cls = isValidSpectralClass(spectralClass)
		? (spectralClass as MainSequenceClass)
		: DEFAULT_SPECTRAL_CLASS
	const starMassKg = getStarMassSol(cls, starSubtype) * M_SOL_KG
	const starDiamM = starDiameterM(spectralClass, starSubtype)

	// Validate and clamp all moons
	let moonsClamped = false
	const validatedMoons = moons
		.map((m) => {
			const result = validateMoon(
				m,
				planetMassKg,
				starMassKg,
				planetRadiusKm,
				orbitalDistanceAU,
				hoursPerDay,
			)
			if (result.clamped) moonsClamped = true
			return result.moon
		})
		.filter((m) => m.orbitalPeriodDays > 0)

	// Precompute semi-major axes
	const semiAxes = validatedMoons.map((m) =>
		moonSemiMajorAxisM(m, planetMassKg, hoursPerDay),
	)

	// Sample at equator, lon=0 (canonical open-ocean point for relative force)
	const surfaceLat = 0
	const surfaceLon = 0

	const events: TidalEvent[] = []

	for (let day = 0; day < daysPerYear; day++) {
		const t = day + 0.5 // sample at midday

		// Star position
		const starPos = starTidalPosition(
			orbitalDistanceAU,
			eccentricity,
			perihelion,
			t,
			daysPerYear,
		)

		// Star tide (zero if tidally locked — bulge is static, not oscillating)
		const starTide = tideLock?.type === "solar"
			? 0
			: starTideContribution(
					starPos.latRad,
					starPos.lonRad,
					starPos.distanceM,
					spectralClass,
					starSubtype,
					surfaceLat,
					surfaceLon,
					planetMassKg,
					planetRadiusM,
				)

		// Moon contributions
		const perMoonRaw: number[] = []
		const moonPhases: number[] = []
		let eclipse: EclipseType = "none"

		for (let i = 0; i < validatedMoons.length; i++) {
			const moon = validatedMoons[i]!
			const pos = keplerMoonPosition(moon, semiAxes[i]!, t)

			const contrib = tideContribution(
				pos.latRad,
				pos.lonRad,
				pos.distanceM,
				moon.massKg,
				surfaceLat,
				surfaceLon,
				planetMassKg,
				planetRadiusM,
			)
			perMoonRaw.push(contrib)

			const phase = moonIlluminatedFraction(
				pos.latRad,
				pos.lonRad,
				starPos.latRad,
				starPos.lonRad,
			)
			moonPhases.push(phase)

			if (eclipse === "none") {
				eclipse = detectEclipse(
					pos.latRad,
					pos.lonRad,
					pos.distanceM,
					moon.diameterKm * 1000,
					starPos.latRad,
					starPos.lonRad,
					starPos.distanceM,
					starDiamM,
					phase,
				)
			}
		}

		// Pad phases and per-moon forces for moons that were filtered out (period=0)
		while (moonPhases.length < moons.length) {
			moonPhases.push(0)
			perMoonRaw.push(0)
		}

		const moonForces = perMoonRaw.map((f) => f / EARTH_MOON_TIDE_REFERENCE)
		const starForce = starTide / EARTH_MOON_TIDE_REFERENCE
		const rawForce = perMoonRaw.reduce((s, f) => s + f, 0) + starTide
		const tidalForce = rawForce / EARTH_MOON_TIDE_REFERENCE

		events.push({
			dayOfYear: day,
			tidalForce,
			moonForces,
			starForce,
			moonPhases,
			eclipseType: eclipse,
		})
	}

	const forces = events.map((e) => e.tidalForce)
	const maxForce = Math.max(...forces, 0)
	const minForce = Math.min(...forces, 0)

	return { events, maxForce, minForce, moonsClamped }
}
