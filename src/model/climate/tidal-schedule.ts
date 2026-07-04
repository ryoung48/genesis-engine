import type {
	GasGiantMoonParams,
	GasGiantSystem,
	MoonParams,
} from "../celestial/moons/moon-types"
import {
	derivePlanetMassKg,
	keplerMoonPosition,
	keplerMoonPositionVector,
	M_SOL_KG,
	moonPeriodBoundsDay,
	moonSemiMajorAxisM,
	orbitalVectorToPlanetFixedPosition,
	resolveMoonOrbitHoursPerDay,
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
	contributorLabels: string[]
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

function buildMoonContributors(
	moons: MoonParams[],
	params: Pick<
		GenesisParams,
		| "hoursPerDay"
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
	const {
		hoursPerDay,
		planetRadiusKm,
		orbitalDistanceAU,
		spectralClass,
		starSubtype,
		tideLock,
	} = params
	const moonOrbitHoursPerDay = resolveMoonOrbitHoursPerDay(
		hoursPerDay,
		tideLock ?? null,
	)
	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const cls = isValidSpectralClass(spectralClass)
		? (spectralClass as MainSequenceClass)
		: DEFAULT_SPECTRAL_CLASS
	const starMassKg = getStarMassSol(cls, starSubtype) * M_SOL_KG

	let moonsClamped = false
	const contributors = moons
		.map((moon, index) => {
			const result = validateMoon(
				moon,
				planetMassKg,
				starMassKg,
				planetRadiusKm,
				orbitalDistanceAU,
				moonOrbitHoursPerDay,
			)
			if (result.clamped) moonsClamped = true
			return { moon: result.moon, index }
		})
		.filter(({ moon }) => moon.orbitalPeriodDays > 0)
		.map(({ moon, index }) => {
			const semiMajorAxisM = moonSemiMajorAxisM(
				moon,
				planetMassKg,
				moonOrbitHoursPerDay,
			)
			return {
				idx: moon.idx,
				label: `Moon ${index + 1}`,
				massKg: moon.massKg,
				diameterKm: moon.diameterKm,
				positionAt: (t: number) => keplerMoonPosition(moon, semiMajorAxisM, t),
			}
		})

	return { contributors, moonsClamped }
}

function gasGiantMoonToOrbitingBody(
	moon: Pick<
		GasGiantMoonParams,
		| "idx"
		| "orbitalPeriodDays"
		| "eccentricity"
		| "inclinationDeg"
		| "longitudeOfAscendingNodeDeg"
		| "argumentOfPeriapsisDeg"
		| "meanAnomalyAtEpochDeg"
	>,
): MoonParams {
	return {
		idx: moon.idx,
		massKg: 0,
		diameterKm: 0,
		orbitalPeriodDays: moon.orbitalPeriodDays,
		eccentricity: moon.eccentricity,
		inclinationDeg: moon.inclinationDeg,
		longitudeOfAscendingNodeDeg: moon.longitudeOfAscendingNodeDeg,
		argumentOfPeriapsisDeg: moon.argumentOfPeriapsisDeg,
		meanAnomalyAtEpochDeg: moon.meanAnomalyAtEpochDeg,
		axialTiltDeg: 0,
		retrogradeRotation: false,
	}
}

function buildGasGiantContributors(
	gasGiantSystem: GasGiantSystem,
): TidalContributor[] {
	const gasGiantDiameterM = gasGiantSystem.gasGiant.diameterKm * 1000
	const mainWorldOrbit = gasGiantMoonToOrbitingBody({
		idx: 0,
		orbitalPeriodDays: gasGiantSystem.mainMoonOrbitalPeriodDays,
		eccentricity: gasGiantSystem.mainMoonEccentricity,
		inclinationDeg: gasGiantSystem.mainMoonInclinationDeg,
		longitudeOfAscendingNodeDeg:
			gasGiantSystem.mainMoonLongitudeOfAscendingNodeDeg,
		argumentOfPeriapsisDeg: gasGiantSystem.mainMoonArgumentOfPeriapsisDeg,
		meanAnomalyAtEpochDeg: gasGiantSystem.mainMoonMeanAnomalyAtEpochDeg,
	})
	const mainWorldSemiMajorAxisM = gasGiantSystem.mainMoonPd * gasGiantDiameterM
	const mainWorldVectorAt = (t: number) =>
		keplerMoonPositionVector(mainWorldOrbit, mainWorldSemiMajorAxisM, t)

	const gasGiantContributor: TidalContributor = {
		idx: 0,
		label: "Gas Giant",
		massKg: gasGiantSystem.gasGiant.massKg,
		diameterKm: gasGiantSystem.gasGiant.diameterKm,
		positionAt: (t: number) => {
			const mainWorldVector = mainWorldVectorAt(t)
			return orbitalVectorToPlanetFixedPosition(
				{
					x: -mainWorldVector.x,
					y: -mainWorldVector.y,
					z: -mainWorldVector.z,
					distanceM: mainWorldVector.distanceM,
					trueAnomalyRad:
						(mainWorldVector.trueAnomalyRad + Math.PI) % (2 * Math.PI),
				},
				t,
			)
		},
	}

	const siblingContributors = gasGiantSystem.siblingMoons.map((moon, index) => {
		const siblingOrbit = gasGiantMoonToOrbitingBody(moon)
		const siblingSemiMajorAxisM = moon.pd * gasGiantDiameterM
		return {
			idx: moon.idx,
			label: `Moon ${index + 1}`,
			massKg: moon.massKg,
			diameterKm: moon.diameterKm,
			positionAt: (t: number) => {
				const mainWorldVector = mainWorldVectorAt(t)
				const siblingVector = keplerMoonPositionVector(
					siblingOrbit,
					siblingSemiMajorAxisM,
					t,
				)
				const dx = siblingVector.x - mainWorldVector.x
				const dy = siblingVector.y - mainWorldVector.y
				const dz = siblingVector.z - mainWorldVector.z
				return orbitalVectorToPlanetFixedPosition(
					{
						x: dx,
						y: dy,
						z: dz,
						distanceM: Math.hypot(dx, dy, dz),
						trueAnomalyRad: siblingVector.trueAnomalyRad,
					},
					t,
				)
			},
		}
	})

	return [gasGiantContributor, ...siblingContributors]
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

	// Sample at equator, lon=0 (canonical open-ocean point for relative force)
	const surfaceLat = 0
	const surfaceLon = 0

	const events: TidalEvent[] = []

	for (let day = 0; day < daysPerYear; day++) {
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

	return {
		events,
		maxForce,
		minForce,
		moonsClamped,
		contributorLabels,
	}
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
	const { contributors, moonsClamped } = buildMoonContributors(moons, params)
	return computeTidalScheduleFromContributors(
		contributors,
		params,
		moonsClamped,
	)
}

export function computeGasGiantTidalSchedule(
	gasGiantSystem: GasGiantSystem,
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
): TidalSchedule {
	return computeTidalScheduleFromContributors(
		buildGasGiantContributors(gasGiantSystem),
		params,
		false,
	)
}
