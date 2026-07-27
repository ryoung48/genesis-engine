import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { MoonBody } from "@/model/celestial/moons/types"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { TIDAL_FORCE } from "@/model/climate/tidal-force"
import type {
	EclipseType,
	SurfaceTidesBreakdown,
	SurfaceTidesContribution,
	TidalContributor,
	TidalEvent,
	TidalSchedule,
} from "@/model/climate/tidal-schedule/types"
import type { GenesisParams } from "@/model/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"

const MAX_TIDAL_SCHEDULE_SAMPLES = 2000

function starDiameterM({
	spectralClass,
	starSubtype,
}: {
	spectralClass: string
	starSubtype: number
}): number {
	const cls = STAR.isValidSpectralClass(spectralClass)
		? spectralClass
		: STAR.defaultSpectralClass
	return (
		STAR.getStarDiameterSol({
			cls: cls as MainSequenceClass,
			subtype: starSubtype,
		}) * 1.392e9
	)
}

function validateMoon({
	moon,
	planetMassKg,
	starMassKg,
	planetRadiusKm,
	orbitalDistanceAU,
}: {
	moon: MoonBody
	planetMassKg: number
	starMassKg: number
	planetRadiusKm: number
	orbitalDistanceAU: number
}): { moon: MoonBody; clamped: boolean } {
	const bounds = MECHANICS.moonPeriodBoundsDay({
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
	const a = MECHANICS.moonSemiMajorAxisM({
		moon: { ...moon, orbitalPeriodDays },
		planetMassKg,
	})
	const planetRadiusM = planetRadiusKm * 1000
	const moonDiameterM = moon.diameterKm * 1000
	const roche = MECHANICS.rocheLimitM({
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

function moonIlluminatedFraction({
	moonLatRad,
	moonLonRad,
	starLatRad,
	starLonRad,
}: {
	moonLatRad: number
	moonLonRad: number
	starLatRad: number
	starLonRad: number
}): number {
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

function detectEclipse({
	moonLatRad,
	moonLonRad,
	moonDistanceM,
	moonDiameterM,
	starLatRad,
	starLonRad,
	starDistM,
	starDiamM,
	phase,
}: {
	moonLatRad: number
	moonLonRad: number
	moonDistanceM: number
	moonDiameterM: number
	starLatRad: number
	starLonRad: number
	starDistM: number
	starDiamM: number
	phase: number
}): EclipseType {
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
		const moonApp = TIDAL_FORCE.apparentDiameterRad({
			bodyDiameterM: moonDiameterM,
			distanceM: moonDistanceM,
		})
		const starApp = TIDAL_FORCE.apparentDiameterRad({
			bodyDiameterM: starDiamM,
			distanceM: starDistM,
		})
		return moonApp >= starApp ? "solar-total" : "solar-annular"
	}

	if (isFull && dotMoonStar < -0.9998) {
		// Moon in planet's shadow — lunar eclipse
		return "lunar"
	}

	return "none"
}

function buildMoonContributors({
	moons,
	params,
}: {
	moons: MoonBody[]
	params: Pick<
		GenesisParams,
		| "planetRadiusKm"
		| "orbitalDistanceAU"
		| "tideLock"
		| "spectralClass"
		| "starSubtype"
	>
}): {
	contributors: TidalContributor[]
	moonsClamped: boolean
} {
	const { planetRadiusKm, orbitalDistanceAU, spectralClass, starSubtype } =
		params
	const planetMassKg = MECHANICS.derivePlanetMassKg(planetRadiusKm)
	const cls = STAR.isValidSpectralClass(spectralClass)
		? (spectralClass as MainSequenceClass)
		: STAR.defaultSpectralClass
	const starMassKg =
		STAR.getStarMassSol({ cls, subtype: starSubtype }) * ORBIT_BODY.solarMassKg

	let moonsClamped = false
	const contributors = moons
		// biome-ignore lint/nursery/useMaxParams: native map callback signature
		.map((moon, index) => {
			const result = validateMoon({
				moon,
				planetMassKg,
				starMassKg,
				planetRadiusKm,
				orbitalDistanceAU,
			})
			if (result.clamped) moonsClamped = true
			return { moon: result.moon, index }
		})
		.filter(({ moon }) => moon.orbitalPeriodDays > 0)
		.map(({ moon, index }) => {
			const semiMajorAxisM = MECHANICS.moonSemiMajorAxisM({
				moon,
				planetMassKg,
			})
			return {
				idx: moon.idx,
				label: `Moon ${index + 1}`,
				massKg: moon.massKg,
				diameterKm: moon.diameterKm,
				positionAt: (t: number) =>
					MECHANICS.keplerMoonPosition({ moon, semiMajorAxisM, t }),
				cartesianAt: (t: number) =>
					MECHANICS.keplerMoonPositionCartesian({
						moon,
						semiMajorAxisM,
						t,
					}),
			}
		})

	return { contributors, moonsClamped }
}

function computeTidalScheduleFromContributors({
	contributors,
	params,
	moonsClamped,
}: {
	contributors: TidalContributor[]
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
	>
	moonsClamped: boolean
}): TidalSchedule {
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
	const planetMassKg = MECHANICS.derivePlanetMassKg(planetRadiusKm)
	const planetRadiusM = planetRadiusKm * 1000
	const starDiamM = starDiameterM({ spectralClass, starSubtype })
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
		const starPos = TIDAL_FORCE.starTidalPosition({
			orbitalDistanceAU,
			planetEccentricity: eccentricity,
			perihelionLonDeg: perihelion,
			t,
			daysPerYear,
		})
		const starTide =
			tideLock?.type === "solar"
				? 0
				: TIDAL_FORCE.starTideContribution({
						starLatRad: starPos.latRad,
						starLonRad: starPos.lonRad,
						starDistanceM: starPos.distanceM,
						spectralClass: spectralClass as MainSequenceClass,
						starSubtype,
						surfaceLatRad: surfaceLat,
						surfaceLonRad: surfaceLon,
						planetMassKg,
						planetRadiusM,
					})

		const perMoonRaw: number[] = []
		const moonPhases: number[] = []
		let eclipse: EclipseType = "none"

		for (const contributor of contributors) {
			const pos = contributor.positionAt(t)
			const lockedToContributor =
				tideLock?.type === "lunar" && tideLock.target === contributor.idx
			const contrib = lockedToContributor
				? 0
				: TIDAL_FORCE.tideContribution({
						bodyLatRad: pos.latRad,
						bodyLonRad: pos.lonRad,
						bodyDistanceM: pos.distanceM,
						bodyMassKg: contributor.massKg,
						surfaceLatRad: surfaceLat,
						surfaceLonRad: surfaceLon,
						planetMassKg,
						planetRadiusM,
					})
			perMoonRaw.push(contrib)

			const phase = moonIlluminatedFraction({
				moonLatRad: pos.latRad,
				moonLonRad: pos.lonRad,
				starLatRad: starPos.latRad,
				starLonRad: starPos.lonRad,
			})
			moonPhases.push(phase)

			if (eclipse === "none") {
				eclipse = detectEclipse({
					moonLatRad: pos.latRad,
					moonLonRad: pos.lonRad,
					moonDistanceM: pos.distanceM,
					moonDiameterM: contributor.diameterKm * 1000,
					starLatRad: starPos.latRad,
					starLonRad: starPos.lonRad,
					starDistM: starPos.distanceM,
					starDiamM,
					phase,
				})
			}
		}

		const moonForces = perMoonRaw.map(
			(f) => f / TIDAL_FORCE.earthMoonTideReference,
		)
		const starForce = starTide / TIDAL_FORCE.earthMoonTideReference
		let rawForce = starTide
		for (const force of perMoonRaw) rawForce += force
		const tidalForce = rawForce / TIDAL_FORCE.earthMoonTideReference

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
			const forceOnA = TIDAL_FORCE.moonMoonTideContribution({
				raisedMoonRadiusM: (a.diameterKm * 1000) / 2,
				raisedMoonMassKg: a.massKg,
				raisingMoonMassKg: b.massKg,
				separationM,
			})
			const forceOnB = TIDAL_FORCE.moonMoonTideContribution({
				raisedMoonRadiusM: (b.diameterKm * 1000) / 2,
				raisedMoonMassKg: b.massKg,
				raisingMoonMassKg: a.massKg,
				separationM,
			})
			moonMoonForces.push(
				Math.max(forceOnA, forceOnB) / TIDAL_FORCE.earthMoonTideReference,
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

function computeMoonTidalSchedule({
	moon,
	parent,
	params,
}: {
	moon: MoonBody
	parent: { idx: number; massKg: number; moons: MoonBody[] }
	params: Pick<
		GenesisParams,
		| "daysPerYear"
		| "hoursPerDay"
		| "spectralClass"
		| "starSubtype"
		| "orbitalDistanceAU"
		| "eccentricity"
		| "perihelion"
	>
}): TidalSchedule {
	const {
		daysPerYear,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		perihelion,
	} = params
	const moonRadiusM = (moon.diameterKm * 1000) / 2
	const moonSemiMajorM = MECHANICS.moonSemiMajorAxisM({
		moon,
		planetMassKg: parent.massKg,
	})
	const siblings = parent.moons.filter((sibling) => sibling.idx !== moon.idx)
	const siblingSemiMajorM = new Map(
		siblings.map((sibling) => [
			sibling.idx,
			MECHANICS.moonSemiMajorAxisM({
				moon: sibling,
				planetMassKg: parent.massKg,
			}),
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
		const starPos = TIDAL_FORCE.starTidalPosition({
			orbitalDistanceAU,
			planetEccentricity: eccentricity,
			perihelionLonDeg: perihelion,
			t,
			daysPerYear,
		})
		const starTide =
			moon.tideLock?.type === "solar"
				? 0
				: TIDAL_FORCE.starTideContribution({
						starLatRad: starPos.latRad,
						starLonRad: starPos.lonRad,
						starDistanceM: starPos.distanceM,
						spectralClass: spectralClass as MainSequenceClass,
						starSubtype,
						surfaceLatRad: 0,
						surfaceLonRad: 0,
						planetMassKg: moon.massKg,
						planetRadiusM: moonRadiusM,
					})

		const parentDistanceM = MECHANICS.keplerMoonPosition({
			moon,
			semiMajorAxisM: moonSemiMajorM,
			t,
		}).distanceM
		const parentForce =
			moon.tideLock?.type === "planet"
				? 0
				: TIDAL_FORCE.moonMoonTideContribution({
						raisedMoonRadiusM: moonRadiusM,
						raisedMoonMassKg: moon.massKg,
						raisingMoonMassKg: parent.massKg,
						separationM: parentDistanceM,
					})

		const moonPos = MECHANICS.keplerMoonPositionCartesian({
			moon,
			semiMajorAxisM: moonSemiMajorM,
			t,
		})
		const siblingForces = siblings.map((sibling) => {
			const lockedToSibling =
				moon.tideLock?.type === "lunar" && moon.tideLock.target === sibling.idx
			if (lockedToSibling) return 0
			const siblingPos = MECHANICS.keplerMoonPositionCartesian({
				moon: sibling,
				semiMajorAxisM: siblingSemiMajorM.get(sibling.idx)!,
				t,
			})
			const dx = moonPos.x - siblingPos.x
			const dy = moonPos.y - siblingPos.y
			const dz = moonPos.z - siblingPos.z
			const separationM = Math.sqrt(dx * dx + dy * dy + dz * dz)
			return TIDAL_FORCE.moonMoonTideContribution({
				raisedMoonRadiusM: moonRadiusM,
				raisedMoonMassKg: moon.massKg,
				raisingMoonMassKg: sibling.massKg,
				separationM,
			})
		})

		const moonForces = [parentForce, ...siblingForces].map(
			(f) => f / TIDAL_FORCE.earthMoonTideReference,
		)
		const starForce = starTide / TIDAL_FORCE.earthMoonTideReference
		let rawForce = parentForce + starTide
		for (const force of siblingForces) rawForce += force
		const tidalForce = rawForce / TIDAL_FORCE.earthMoonTideReference

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

function computeTidalSchedule({
	moons,
	params,
}: {
	moons: MoonBody[]
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
	>
}): TidalSchedule {
	const { contributors, moonsClamped } = buildMoonContributors({
		moons,
		params,
	})
	return computeTidalScheduleFromContributors({
		contributors,
		params,
		moonsClamped,
	})
}

function computeSurfaceTidesM({
	moons,
	planet,
	params,
}: {
	moons: MoonBody[]
	planet: { diameterKm: number; tideLock?: TideLock | null }
	params: Pick<
		GenesisParams,
		| "hoursPerDay"
		| "spectralClass"
		| "starSubtype"
		| "orbitalDistanceAU"
		| "eccentricity"
	> & { starName?: string }
}): SurfaceTidesBreakdown {
	const {
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		starName,
	} = params
	const cls = STAR.isValidSpectralClass(spectralClass)
		? (spectralClass as MainSequenceClass)
		: STAR.defaultSpectralClass
	const starMassKg =
		STAR.getStarMassSol({ cls, subtype: starSubtype }) * ORBIT_BODY.solarMassKg
	const planetMassKg = MECHANICS.derivePlanetMassKg(planet.diameterKm / 2)
	const planetRadiusM = (planet.diameterKm / 2) * 1000

	const contributions: SurfaceTidesContribution[] = []
	if (planet.tideLock?.type !== "solar") {
		const periapsisM =
			orbitalDistanceAU * (1 - eccentricity) * ORBIT_BODY.astronomicalUnitM
		contributions.push({
			label: starName ?? "Star",
			valueM: TIDAL_FORCE.tideContribution({
				bodyLatRad: 0,
				bodyLonRad: 0,
				bodyDistanceM: periapsisM,
				bodyMassKg: starMassKg,
				surfaceLatRad: 0,
				surfaceLonRad: 0,
				planetMassKg,
				planetRadiusM,
			}),
		})
	}

	for (let index = 0; index < moons.length; index++) {
		const moon = moons[index]!
		const lockedToMoon =
			planet.tideLock?.type === "lunar" && planet.tideLock.target === moon.idx
		if (lockedToMoon) continue
		const semiMajorAxisM = MECHANICS.moonSemiMajorAxisM({
			moon,
			planetMassKg,
		})
		const periapsisM = semiMajorAxisM * (1 - moon.eccentricity)
		contributions.push({
			label: moon.name ?? `Moon ${index + 1}`,
			valueM: TIDAL_FORCE.tideContribution({
				bodyLatRad: 0,
				bodyLonRad: 0,
				bodyDistanceM: periapsisM,
				bodyMassKg: moon.massKg,
				surfaceLatRad: 0,
				surfaceLonRad: 0,
				planetMassKg,
				planetRadiusM,
			}),
		})
	}

	return {
		// biome-ignore lint/nursery/useMaxParams: Array.reduce supplies accumulator and item separately.
		totalM: contributions.reduce((sum, c) => sum + c.valueM, 0),
		contributions,
	}
}

function computeMoonSurfaceTidesM({
	moon,
	parent,
	params,
}: {
	moon: MoonBody
	parent: {
		name?: string
		massKg: number
		diameterKm: number
		moons: MoonBody[]
	}
	params: Pick<
		GenesisParams,
		| "hoursPerDay"
		| "spectralClass"
		| "starSubtype"
		| "orbitalDistanceAU"
		| "eccentricity"
	> & { starName?: string }
}): SurfaceTidesBreakdown {
	const {
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		starName,
	} = params
	const cls = STAR.isValidSpectralClass(spectralClass)
		? (spectralClass as MainSequenceClass)
		: STAR.defaultSpectralClass
	const starMassKg =
		STAR.getStarMassSol({ cls, subtype: starSubtype }) * ORBIT_BODY.solarMassKg
	const moonRadiusM = (moon.diameterKm * 1000) / 2
	const siblings = parent.moons.filter((sibling) => sibling.idx !== moon.idx)

	const contributions: SurfaceTidesContribution[] = []
	if (moon.tideLock?.type !== "solar") {
		const periapsisM =
			orbitalDistanceAU * (1 - eccentricity) * ORBIT_BODY.astronomicalUnitM
		contributions.push({
			label: starName ?? "Star",
			valueM: TIDAL_FORCE.tideContribution({
				bodyLatRad: 0,
				bodyLonRad: 0,
				bodyDistanceM: periapsisM,
				bodyMassKg: starMassKg,
				surfaceLatRad: 0,
				surfaceLonRad: 0,
				planetMassKg: moon.massKg,
				planetRadiusM: moonRadiusM,
			}),
		})
	}

	const moonSemiMajorM = MECHANICS.moonSemiMajorAxisM({
		moon,
		planetMassKg: parent.massKg,
	})
	const moonPeriapsisM = moonSemiMajorM * (1 - moon.eccentricity)
	if (moon.tideLock?.type !== "planet") {
		contributions.push({
			label: parent.name ?? "Parent planet",
			valueM: TIDAL_FORCE.moonMoonTideContribution({
				raisedMoonRadiusM: moonRadiusM,
				raisedMoonMassKg: moon.massKg,
				raisingMoonMassKg: parent.massKg,
				separationM: moonPeriapsisM,
			}),
		})
	}

	for (const sibling of siblings) {
		const lockedToSibling =
			moon.tideLock?.type === "lunar" && moon.tideLock.target === sibling.idx
		if (lockedToSibling) continue
		const siblingSemiMajorM = MECHANICS.moonSemiMajorAxisM({
			moon: sibling,
			planetMassKg: parent.massKg,
		})
		const siblingPeriapsisM = siblingSemiMajorM * (1 - sibling.eccentricity)
		const minSeparationM = Math.abs(moonPeriapsisM - siblingPeriapsisM)
		contributions.push({
			label: sibling.name ?? `Moon ${sibling.idx}`,
			valueM: TIDAL_FORCE.moonMoonTideContribution({
				raisedMoonRadiusM: moonRadiusM,
				raisedMoonMassKg: moon.massKg,
				raisingMoonMassKg: sibling.massKg,
				separationM: minSeparationM,
			}),
		})
	}

	return {
		// biome-ignore lint/nursery/useMaxParams: Array.reduce supplies accumulator and item separately.
		totalM: contributions.reduce((sum, c) => sum + c.valueM, 0),
		contributions,
	}
}

function buildSurfaceTidesSeismologyCallbacks(
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
	getSurfaceTidesHeatingForMoon: ({
		parent,
		moon,
	}: {
		parent: {
			name?: string
			massKg: number
			diameterKm: number
			siderealDayHours: number
			orbitalDistanceAU: number
			eccentricity: number
			moons: MoonBody[]
		}
		moon: MoonBody
	}) => number
} {
	return {
		getSurfaceTidesHeatingForBody: (body) =>
			body.group === "asteroid belt"
				? 0
				: computeSurfaceTidesM({
						moons: body.moons,
						planet: body,
						params: {
							...params,
							hoursPerDay: body.siderealDayHours,
							orbitalDistanceAU: body.orbitalDistanceAU,
							eccentricity: body.eccentricity,
						},
					}).totalM,
		getSurfaceTidesHeatingForMoon: ({ parent, moon }) =>
			computeMoonSurfaceTidesM({
				moon,
				parent,
				params: {
					...params,
					hoursPerDay: parent.siderealDayHours,
					orbitalDistanceAU: parent.orbitalDistanceAU,
					eccentricity: parent.eccentricity,
				},
			}).totalM,
	}
}

export const TIDAL_SCHEDULE = {
	computeMoonTidalSchedule,
	computeTidalSchedule,
	computeSurfaceTidesM,
	computeMoonSurfaceTidesM,
	buildSurfaceTidesSeismologyCallbacks,
}
