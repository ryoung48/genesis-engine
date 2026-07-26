import type { MoonBody } from "../celestial/moons"
import {
	derivePlanetMassKg,
	keplerMoonPosition,
	keplerMoonPositionCartesian,
	moonPeriodBoundsDay,
	moonSemiMajorAxisM,
	rocheLimitM,
} from "../celestial/moons"
import {
	ASTRONOMICAL_UNIT_M,
	SOLAR_MASS_KG,
	type TideLock,
} from "../celestial/orbit-body"
import type { MainSequenceClass } from "../celestial/star"
import { DEFAULT_SPECTRAL_CLASS, STAR } from "../celestial/star"
import type { GenesisParams } from "../types"
import {
	apparentDiameterRad,
	EARTH_MOON_TIDE_REFERENCE,
	moonMoonTideContribution,
	starTidalPosition,
	starTideContribution,
	tideContribution,
} from "./tidal-force"

const MAX_TIDAL_SCHEDULE_SAMPLES = 2000

type EclipseType = "solar-total" | "solar-annular" | "lunar" | "none"

interface TidalEvent {
	dayOfYear: number
	tidalForce: number
	moonForces: number[]
	starForce: number
	moonPhases: number[]
	eclipseType: EclipseType
	moonMoonForces: number[]
	moonMoonSeparationsKm: number[]
}

export interface TidalSchedule {
	events: TidalEvent[]
	maxForce: number
	minForce: number
	moonsClamped: boolean
	contributorLabels: string[]
	moonMoonPairLabels: string[]
}

interface TidalContributor {
	idx: number
	label: string
	massKg: number
	diameterKm: number
	positionAt: (t: number) => {
		latRad: number
		lonRad: number
		distanceM: number
	}
	cartesianAt: (t: number) => { x: number; y: number; z: number }
}

// Star diameter in metres (for eclipse apparent size comparison)
function starDiameterM(spectralClass: string, starSubtype: number): number {
	const cls = STAR.isValidSpectralClass(spectralClass)
		? spectralClass
		: DEFAULT_SPECTRAL_CLASS
	return (
		STAR.getStarDiameterSol({
			cls: cls as MainSequenceClass,
			subtype: starSubtype,
		}) * 1.392e9
	)
}

// Clamp moon orbital period to valid bounds and return adjusted moon + clamped flag
function validateMoon(
	moon: MoonBody,
	planetMassKg: number,
	starMassKg: number,
	planetRadiusKm: number,
	orbitalDistanceAU: number,
): { moon: MoonBody; clamped: boolean } {
	const bounds = moonPeriodBoundsDay({
		moon,
		planetMassKg,
		starMassKg,
		planetRadiusKm,
		orbitalDistanceAU,
	})
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
	const a = moonSemiMajorAxisM({
		moon: { ...moon, orbitalPeriodDays },
		planetMassKg,
	})
	const planetRadiusM = planetRadiusKm * 1000
	const moonDiameterM = moon.diameterKm * 1000
	const roche = rocheLimitM({
		planetRadiusM,
		moonMassKg: moon.massKg,
		moonDiameterM,
	})
	const eMax = Math.max(0, 1 - roche / a)
	if (eccentricity > eMax) {
		eccentricity = eMax * 0.9
		clamped = true
	}

	return { moon: { ...moon, orbitalPeriodDays, eccentricity }, clamped }
}

// Moon phase: illuminated fraction as seen from planet
// Phase angle Î± = angle at moon between planet and star directions
function moonIlluminatedFraction(
	moonLatRad: number,
	moonLonRad: number,
	starLatRad: number,
	starLonRad: number,
): number {
	// cos Î± = dot product of unit vectors from planet to moon and planet to star
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

function buildMoonContributors(
	moons: MoonBody[],
	params: Pick<
		GenesisParams,
		| "planetRadiusKm"
		| "orbitalDistanceAU"
		| "tideLock"
		| "spectralClass"
		| "starSubtype"
	>,
): {
	contributors: TidalContributor[]
	moonsClamped: boolean
} {
	const { planetRadiusKm, orbitalDistanceAU, spectralClass, starSubtype } =
		params
	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const cls = STAR.isValidSpectralClass(spectralClass)
		? (spectralClass as MainSequenceClass)
		: DEFAULT_SPECTRAL_CLASS
	const starMassKg =
		STAR.getStarMassSol({ cls, subtype: starSubtype }) * SOLAR_MASS_KG

	let moonsClamped = false
	const contributors = moons
		.map((moon, index) => {
			const result = validateMoon(
				moon,
				planetMassKg,
				starMassKg,
				planetRadiusKm,
				orbitalDistanceAU,
			)
			if (result.clamped) moonsClamped = true
			return { moon: result.moon, index }
		})
		.filter(({ moon }) => moon.orbitalPeriodDays > 0)
		.map(({ moon, index }) => {
			const semiMajorAxisM = moonSemiMajorAxisM({ moon, planetMassKg })
			return {
				idx: moon.idx,
				label: `Moon ${index + 1}`,
				massKg: moon.massKg,
				diameterKm: moon.diameterKm,
				positionAt: (t: number) =>
					keplerMoonPosition({ moon, semiMajorAxisM, t }),
				cartesianAt: (t: number) =>
					keplerMoonPositionCartesian({ moon, semiMajorAxisM, t }),
			}
		})

	return { contributors, moonsClamped }
}

function computeTidalScheduleFromContributors(
	contributors: TidalContributor[],
	params: Pick<
		GenesisParams,
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
	moonsClamped: boolean,
): TidalSchedule {
	const {
		daysPerYear,
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
	const starDiamM = starDiameterM(spectralClass, starSubtype)
	const contributorLabels = contributors.map((contributor) => contributor.label)

	// Every unordered moon pair -- tide each raises on the other, per the
	// Traveller ruleset's optional "Moon to Moon Tidal Effect".
	const moonPairs: [TidalContributor, TidalContributor][] = []
	for (let i = 0; i < contributors.length; i++) {
		for (let j = i + 1; j < contributors.length; j++) {
			moonPairs.push([contributors[i]!, contributors[j]!])
		}
	}
	const moonMoonPairLabels = moonPairs.map(([a, b]) => `${a.label}↔${b.label}`)

	// Sample at equator, lon=0 (canonical open-ocean point for relative force)
	const surfaceLat = 0
	const surfaceLon = 0

	const events: TidalEvent[] = []

	// daysPerYear can run into the millions for a main world parked way out in
	// an O/B star's (enormous, luminosity-driven) habitable zone — sampling
	// every single day would iterate that many times synchronously and hang
	// the tab. Widening the sample step keeps the total iteration count
	// bounded while still spreading samples across the *real* orbital period
	// (dayOfYear stays the true day number, just sparser), rather than
	// truncating to only the first N days of a huge year. No-op for any
	// normal-sized year (daysPerYear <= MAX_TIDAL_SCHEDULE_SAMPLES), where
	// dayStep is exactly 1.
	const dayStep = Math.max(
		1,
		Math.floor(daysPerYear / MAX_TIDAL_SCHEDULE_SAMPLES),
	)

	for (let day = 0; day < daysPerYear; day += dayStep) {
		const t = day + 0.5 // sample at midday
		const starPos = starTidalPosition(
			orbitalDistanceAU,
			eccentricity,
			perihelion,
			t,
			daysPerYear,
		)
		const starTide =
			tideLock?.type === "solar"
				? 0
				: starTideContribution(
						starPos.latRad,
						starPos.lonRad,
						starPos.distanceM,
						spectralClass as MainSequenceClass,
						starSubtype,
						surfaceLat,
						surfaceLon,
						planetMassKg,
						planetRadiusM,
					)

		const perMoonRaw: number[] = []
		const moonPhases: number[] = []
		let eclipse: EclipseType = "none"

		for (const contributor of contributors) {
			const pos = contributor.positionAt(t)
			const lockedToContributor =
				tideLock?.type === "lunar" && tideLock.target === contributor.idx
			const contrib = lockedToContributor
				? 0
				: tideContribution(
						pos.latRad,
						pos.lonRad,
						pos.distanceM,
						contributor.massKg,
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
					contributor.diameterKm * 1000,
					starPos.latRad,
					starPos.lonRad,
					starPos.distanceM,
					starDiamM,
					phase,
				)
			}
		}

		const moonForces = perMoonRaw.map((f) => f / EARTH_MOON_TIDE_REFERENCE)
		const starForce = starTide / EARTH_MOON_TIDE_REFERENCE
		const rawForce = perMoonRaw.reduce((s, f) => s + f, 0) + starTide
		const tidalForce = rawForce / EARTH_MOON_TIDE_REFERENCE

		const moonMoonForces: number[] = []
		const moonMoonSeparationsKm: number[] = []
		for (const [a, b] of moonPairs) {
			const posA = a.cartesianAt(t)
			const posB = b.cartesianAt(t)
			const dx = posA.x - posB.x
			const dy = posA.y - posB.y
			const dz = posA.z - posB.z
			const separationM = Math.sqrt(dx * dx + dy * dy + dz * dz)
			// Report whichever moon feels the stronger raised tide -- the
			// larger of the two directions, since either could be the one
			// that matters for that moon's own tidal heating/flexing.
			const forceOnA = moonMoonTideContribution(
				(a.diameterKm * 1000) / 2,
				a.massKg,
				b.massKg,
				separationM,
			)
			const forceOnB = moonMoonTideContribution(
				(b.diameterKm * 1000) / 2,
				b.massKg,
				a.massKg,
				separationM,
			)
			moonMoonForces.push(
				Math.max(forceOnA, forceOnB) / EARTH_MOON_TIDE_REFERENCE,
			)
			moonMoonSeparationsKm.push(separationM / 1000)
		}

		events.push({
			dayOfYear: day,
			tidalForce,
			moonForces,
			starForce,
			moonPhases,
			eclipseType: eclipse,
			moonMoonForces,
			moonMoonSeparationsKm,
		})
	}

	const forces = events.map((e) => e.tidalForce)
	let maxForce = 0
	let minForce = 0
	for (const f of forces) {
		if (f > maxForce) maxForce = f
		if (f < minForce) minForce = f
	}

	return {
		events,
		maxForce,
		minForce,
		moonsClamped,
		contributorLabels,
		moonMoonPairLabels,
	}
}

// Tidal schedule for a MOON's own surface, rather than a planet's -- the
// external raisers here are its parent planet and sibling moons (not its own
// children, since moons don't have moons). Unlike computeTidalSchedule's
// planet-focused contributors, these use the peak/sub-point amplitude
// (moonMoonTideContribution, same convention as the moon-to-moon pairs
// there) rather than tracking a rotating local surface point -- so there's
// no eclipse/phase detail here, just the tidal-force time series.
export function computeMoonTidalSchedule(
	moon: MoonBody,
	parent: { idx: number; massKg: number; moons: MoonBody[] },
	params: Pick<
		GenesisParams,
		| "daysPerYear"
		| "hoursPerDay"
		| "spectralClass"
		| "starSubtype"
		| "orbitalDistanceAU"
		| "eccentricity"
		| "perihelion"
	>,
): TidalSchedule {
	const {
		daysPerYear,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		perihelion,
	} = params
	const moonRadiusM = (moon.diameterKm * 1000) / 2
	const moonSemiMajorM = moonSemiMajorAxisM({
		moon,
		planetMassKg: parent.massKg,
	})
	const siblings = parent.moons.filter((sibling) => sibling.idx !== moon.idx)
	const siblingSemiMajorM = new Map(
		siblings.map((sibling) => [
			sibling.idx,
			moonSemiMajorAxisM({ moon: sibling, planetMassKg: parent.massKg }),
		]),
	)

	const contributorLabels = [
		"Parent planet",
		...siblings.map((s) => `Moon ${s.idx}`),
	]
	const dayStep = Math.max(
		1,
		Math.floor(daysPerYear / MAX_TIDAL_SCHEDULE_SAMPLES),
	)
	const events: TidalEvent[] = []

	for (let day = 0; day < daysPerYear; day += dayStep) {
		const t = day + 0.5
		const starPos = starTidalPosition(
			orbitalDistanceAU,
			eccentricity,
			perihelion,
			t,
			daysPerYear,
		)
		const starTide =
			moon.tideLock?.type === "solar"
				? 0
				: starTideContribution(
						starPos.latRad,
						starPos.lonRad,
						starPos.distanceM,
						spectralClass as MainSequenceClass,
						starSubtype,
						0,
						0,
						moon.massKg,
						moonRadiusM,
					)

		const parentDistanceM = keplerMoonPosition({
			moon,
			semiMajorAxisM: moonSemiMajorM,
			t,
		}).distanceM
		const parentForce =
			moon.tideLock?.type === "planet"
				? 0
				: moonMoonTideContribution(
						moonRadiusM,
						moon.massKg,
						parent.massKg,
						parentDistanceM,
					)

		const moonPos = keplerMoonPositionCartesian({
			moon,
			semiMajorAxisM: moonSemiMajorM,
			t,
		})
		const siblingForces = siblings.map((sibling) => {
			const lockedToSibling =
				moon.tideLock?.type === "lunar" && moon.tideLock.target === sibling.idx
			if (lockedToSibling) return 0
			const siblingPos = keplerMoonPositionCartesian({
				moon: sibling,
				semiMajorAxisM: siblingSemiMajorM.get(sibling.idx)!,
				t,
			})
			const dx = moonPos.x - siblingPos.x
			const dy = moonPos.y - siblingPos.y
			const dz = moonPos.z - siblingPos.z
			const separationM = Math.sqrt(dx * dx + dy * dy + dz * dz)
			return moonMoonTideContribution(
				moonRadiusM,
				moon.massKg,
				sibling.massKg,
				separationM,
			)
		})

		const moonForces = [parentForce, ...siblingForces].map(
			(f) => f / EARTH_MOON_TIDE_REFERENCE,
		)
		const starForce = starTide / EARTH_MOON_TIDE_REFERENCE
		const rawForce =
			parentForce + siblingForces.reduce((s, f) => s + f, 0) + starTide
		const tidalForce = rawForce / EARTH_MOON_TIDE_REFERENCE

		events.push({
			dayOfYear: day,
			tidalForce,
			moonForces,
			starForce,
			moonPhases: [],
			eclipseType: "none",
			moonMoonForces: [],
			moonMoonSeparationsKm: [],
		})
	}

	const forces = events.map((e) => e.tidalForce)
	let maxForce = 0
	let minForce = 0
	for (const f of forces) {
		if (f > maxForce) maxForce = f
		if (f < minForce) minForce = f
	}

	return {
		events,
		maxForce,
		minForce,
		moonsClamped: false,
		contributorLabels,
		moonMoonPairLabels: [],
	}
}

export function computeTidalSchedule(
	moons: MoonBody[],
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
	const { contributors, moonsClamped } = buildMoonContributors(moons, params)
	return computeTidalScheduleFromContributors(
		contributors,
		params,
		moonsClamped,
	)
}

interface SurfaceTidesContribution {
	label: string
	valueM: number
}

export interface SurfaceTidesBreakdown {
	totalM: number
	contributions: SurfaceTidesContribution[]
}

// Theoretical peak (metres) for a planet -- every contributor (star + each
// own moon) evaluated at its own periapsis and at the sub-point (cosÏˆ=1)
// simultaneously, using the same physical equilibrium-tide formula as
// computeTidalSchedule's real time series above, rather than assuming they
// all happen at once the way the sampled Spring/Neap max/min do. A true
// upper bound: real alignment this good may never actually occur, but it
// won't be exceeded either. Returns the per-source breakdown alongside the
// total so callers can show where the number comes from.
export function computeSurfaceTidesM(
	moons: MoonBody[],
	planet: { diameterKm: number; tideLock?: TideLock | null },
	params: Pick<
		GenesisParams,
		| "hoursPerDay"
		| "spectralClass"
		| "starSubtype"
		| "orbitalDistanceAU"
		| "eccentricity"
	> & { starName?: string },
): SurfaceTidesBreakdown {
	const {
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		starName,
	} = params
	const cls = STAR.isValidSpectralClass(spectralClass)
		? (spectralClass as MainSequenceClass)
		: DEFAULT_SPECTRAL_CLASS
	const starMassKg =
		STAR.getStarMassSol({ cls, subtype: starSubtype }) * SOLAR_MASS_KG
	const planetMassKg = derivePlanetMassKg(planet.diameterKm / 2)
	const planetRadiusM = (planet.diameterKm / 2) * 1000

	const contributions: SurfaceTidesContribution[] = []
	if (planet.tideLock?.type !== "solar") {
		const periapsisM =
			orbitalDistanceAU * (1 - eccentricity) * ASTRONOMICAL_UNIT_M
		contributions.push({
			label: starName ?? "Star",
			valueM: tideContribution(
				0,
				0,
				periapsisM,
				starMassKg,
				0,
				0,
				planetMassKg,
				planetRadiusM,
			),
		})
	}

	moons.forEach((moon, index) => {
		const lockedToMoon =
			planet.tideLock?.type === "lunar" && planet.tideLock.target === moon.idx
		if (lockedToMoon) return
		const semiMajorAxisM = moonSemiMajorAxisM({ moon, planetMassKg })
		const periapsisM = semiMajorAxisM * (1 - moon.eccentricity)
		contributions.push({
			label: moon.name ?? `Moon ${index + 1}`,
			valueM: tideContribution(
				0,
				0,
				periapsisM,
				moon.massKg,
				0,
				0,
				planetMassKg,
				planetRadiusM,
			),
		})
	})

	return {
		totalM: contributions.reduce((sum, c) => sum + c.valueM, 0),
		contributions,
	}
}

// Moon-focused counterpart of computeSurfaceTidesM -- parent planet +
// sibling moons, matching computeMoonTidalSchedule's contributor set. The
// sibling term uses the closest separation achievable if both happened to
// be at periapsis on the same side simultaneously (|periapsisA - periapsisB|)
// -- the same "assume best-case alignment" convention as the rest of this
// ceiling, not the real time-varying separation.
export function computeMoonSurfaceTidesM(
	moon: MoonBody,
	parent: {
		name?: string
		massKg: number
		diameterKm: number
		moons: MoonBody[]
	},
	params: Pick<
		GenesisParams,
		| "hoursPerDay"
		| "spectralClass"
		| "starSubtype"
		| "orbitalDistanceAU"
		| "eccentricity"
	> & { starName?: string },
): SurfaceTidesBreakdown {
	const {
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		starName,
	} = params
	const cls = STAR.isValidSpectralClass(spectralClass)
		? (spectralClass as MainSequenceClass)
		: DEFAULT_SPECTRAL_CLASS
	const starMassKg =
		STAR.getStarMassSol({ cls, subtype: starSubtype }) * SOLAR_MASS_KG
	const moonRadiusM = (moon.diameterKm * 1000) / 2
	const siblings = parent.moons.filter((sibling) => sibling.idx !== moon.idx)

	const contributions: SurfaceTidesContribution[] = []
	if (moon.tideLock?.type !== "solar") {
		const periapsisM =
			orbitalDistanceAU * (1 - eccentricity) * ASTRONOMICAL_UNIT_M
		contributions.push({
			label: starName ?? "Star",
			valueM: tideContribution(
				0,
				0,
				periapsisM,
				starMassKg,
				0,
				0,
				moon.massKg,
				moonRadiusM,
			),
		})
	}

	const moonSemiMajorM = moonSemiMajorAxisM({
		moon,
		planetMassKg: parent.massKg,
	})
	const moonPeriapsisM = moonSemiMajorM * (1 - moon.eccentricity)
	if (moon.tideLock?.type !== "planet") {
		contributions.push({
			label: parent.name ?? "Parent planet",
			valueM: moonMoonTideContribution(
				moonRadiusM,
				moon.massKg,
				parent.massKg,
				moonPeriapsisM,
			),
		})
	}

	for (const sibling of siblings) {
		const lockedToSibling =
			moon.tideLock?.type === "lunar" && moon.tideLock.target === sibling.idx
		if (lockedToSibling) continue
		const siblingSemiMajorM = moonSemiMajorAxisM({
			moon: sibling,
			planetMassKg: parent.massKg,
		})
		const siblingPeriapsisM = siblingSemiMajorM * (1 - sibling.eccentricity)
		const minSeparationM = Math.abs(moonPeriapsisM - siblingPeriapsisM)
		contributions.push({
			label: sibling.name ?? `Moon ${sibling.idx}`,
			valueM: moonMoonTideContribution(
				moonRadiusM,
				moon.massKg,
				sibling.massKg,
				minSeparationM,
			),
		})
	}

	return {
		totalM: contributions.reduce((sum, c) => sum + c.valueM, 0),
		contributions,
	}
}

// Wires computeSurfaceTidesM/computeMoonSurfaceTidesM up as the
// getSurfaceTidesHeatingForBody/Moon callbacks applySystemSeismology()
// accepts, so its regime/totalHeating fold in surface tides alongside
// residual and tidal heating -- system-seismology.ts takes callbacks rather
// than importing this module directly to avoid a module cycle (this file ->
// orbital-mechanics.ts -> sol-system.ts -> system-seismology.ts).
//
// hoursPerDay is deliberately NOT part of the fixed `params` here: it's the
// day-length basis moonSemiMajorAxisM uses to turn a moon's orbitalPeriodDays
// back into a real distance via Kepler, so it has to be each PARENT
// PLANET'S OWN siderealDayHours (Jupiter's ~9.93h, not the main world's),
// matching the convention the live stats card already uses
// (GenerationPanel.tsx's parentHoursPerDay = body.siderealDayHours) --
// passing the system-wide main-world hoursPerDay here instead silently
// mis-scaled every non-main-world moon's tide contribution.
export function buildSurfaceTidesSeismologyCallbacks(
	params: Pick<GenesisParams, "spectralClass" | "starSubtype">,
): {
	getSurfaceTidesHeatingForBody: (body: {
		group?: string
		diameterKm: number
		tideLock?: TideLock | null
		orbitalDistanceAU: number
		eccentricity: number
		siderealDayHours: number
		moons: MoonBody[]
	}) => number
	getSurfaceTidesHeatingForMoon: (
		parent: {
			name?: string
			massKg: number
			diameterKm: number
			siderealDayHours: number
			orbitalDistanceAU: number
			eccentricity: number
			moons: MoonBody[]
		},
		moon: MoonBody,
	) => number
} {
	return {
		getSurfaceTidesHeatingForBody: (body) =>
			body.group === "asteroid belt"
				? 0
				: computeSurfaceTidesM(body.moons, body, {
						...params,
						hoursPerDay: body.siderealDayHours,
						orbitalDistanceAU: body.orbitalDistanceAU,
						eccentricity: body.eccentricity,
					}).totalM,
		getSurfaceTidesHeatingForMoon: (parent, moon) =>
			computeMoonSurfaceTidesM(moon, parent, {
				...params,
				hoursPerDay: parent.siderealDayHours,
				orbitalDistanceAU: parent.orbitalDistanceAU,
				eccentricity: parent.eccentricity,
			}).totalM,
	}
}
