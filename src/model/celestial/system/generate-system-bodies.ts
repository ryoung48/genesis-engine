import type {
	AtmosphereProfile,
	MoonBody,
	TideLock,
} from "@/model/celestial/moons/moon-types"
import {
	attachParentTideLocks,
	rollInclinationDeg,
} from "@/model/celestial/moons/moon-utils"
import {
	generateMoons,
	M_SOL_KG,
	rollMoonCountForParent,
	rollMoonEccentricity,
} from "@/model/celestial/moons/orbital-mechanics"
import type { OrbitBody } from "@/model/celestial/orbit-body"
import {
	getKeplerYearYears,
	getStarLuminositySol,
	getStarMAO,
	getStarMassSol,
	type MainSequenceClass,
	rollStarAgeGyr,
} from "@/model/celestial/star/star-types"
import { estimateGreenhouseFactor } from "@/model/climate/ebm/greenhouse-estimate"
import { buildSurfaceTidesSeismologyCallbacks } from "@/model/climate/tidal-schedule"
import { createRng } from "@/model/shared/rng"
import { LANGUAGE } from "@/model/society/language/languages"
import { estimateGasGiantSizeClass, estimateRockySizeClass } from "./size-class"
import {
	buildPlanet,
	SOL_MAIN_WORLD_DEFAULTS,
	SOL_SEED,
	SOL_STAR_AGE_GYR,
	SOL_SYSTEM_BODIES,
	type SolPlanetSeed,
} from "./sol-system"
import {
	auFromTemperature,
	buildClassificationEnvironment,
	buildDensityProfile,
	type ClassifiedEnvironment,
	classifyBody,
	type DensityProfile,
	deviationToAU,
	type OrbitClassification,
	type OrbitGroup,
	rollClassificationAssignment,
	type Zone,
} from "./system-environment"
import {
	applySystemSeismology,
	computeMoonTidalHeatingRaw,
	MAX_SAFE_MOON_TIDAL_HEATING,
} from "./system-seismology"
import {
	deriveTideLockStatus,
	rollMoonTideLock,
	rollPlanetTideLock,
} from "./tide-lock"

const DAYS_PER_YEAR = 365.25
const EARTH_DIAMETER_KM = 12_742
const EARTH_MASS_KG = 5.973886146404331e24
// Mirrors the UI's DEFAULT_WORLD_PARAMS.continentSizeVariety (defaults.ts) --
// duplicated here since this model-layer file must not import from the UI
// layer. A rolled main world's continentSizeVariety starts at this Earth-like
// default, edited by hand afterward via the normal slider.
const EARTH_DEFAULT_CONTINENT_SIZE_VARIETY = 0.35

// Procedurally generated body textures (public/generated/<classification>/...)
// -- only classifications with real art get a texturePath; anything else
// (tectonic, oceanic, panthalassic, helian, ...) is left unset and falls back
// to the renderer's plain "blue" solid-color material, same as before this
// existed. Never applies to the real Sol seed, which keeps its own authored
// textures.
const GENERATED_TEXTURE_FILES: Partial<Record<OrbitClassification, string[]>> =
	{
		jovian: ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png"],
		rockball: ["1.png", "2.png", "3.png", "4.png", "5.png"],
		telluric: ["1.png", "2.png", "3.png", "4.png", "5.png"],
		meltball: ["1.png", "2.png", "3.png", "4.png", "5.png"],
		snowball: ["1.png", "2.png", "3.png", "4.png", "5.png"],
		arid: [
			"Dry-EQUIRECTANGULAR-1-1024x512.png",
			"Dry-EQUIRECTANGULAR-2-1024x512.png",
			"Dry-EQUIRECTANGULAR-3-1024x512.png",
			"Dry-EQUIRECTANGULAR-4-1024x512.png",
			"Dry-EQUIRECTANGULAR-5-1024x512.png",
			"Martian-EQUIRECTANGULAR-1-1024x512.png",
			"Martian-EQUIRECTANGULAR-2-1024x512.png",
			"Martian-EQUIRECTANGULAR-3-1024x512.png",
			"Martian-EQUIRECTANGULAR-4-1024x512.png",
			"Martian-EQUIRECTANGULAR-5-1024x512.png",
		],
	}

function pickGeneratedTexturePath(
	rng: ReturnType<typeof createRng>,
	classification: OrbitClassification,
): string | undefined {
	const files = GENERATED_TEXTURE_FILES[classification]
	if (!files || files.length === 0) return undefined
	const file = files[rng.randint(0, files.length - 1)]
	return `/generated/${classification}/${file}`
}

interface RingProfile {
	innerRadiusRelative: number
	outerRadiusRelative: number
	color: number
	opacity: number
}

export interface SystemBody extends OrbitBody {
	/** Stable identifier for this body within the system -- the main world is
	 * always -1; siblings/preset planets get non-negative indices. Lets a
	 * moon's tideLock reference "my parent" without embedding an object
	 * reference. See attachParentTideLocks. */
	seed: string
	sizeClass: number
	density: DensityProfile | null
	group: OrbitGroup
	classification: OrbitClassification
	rings?: RingProfile
	atmosphere: AtmosphereProfile | null
	isMainWorld: boolean
	orbitalDistanceAU: number
	/** 0 / unused for asteroid belts. */
	diameterKm: number
	/** 0 / unused for asteroid belts. */
	massKg: number
	/** 0 / unused for asteroid belts. */
	gravityG: number
	/** Sidereal rotation period (relative to the stars, not the sun) — 0 /
	 * unused for asteroid belts. */
	siderealDayHours: number
	/** Longitude of perihelion, in degrees. */
	longitudeOfPerihelionDeg: number
	/** 0 / unused for asteroid belts. */
	axialTiltDeg: number
	/** Orbital inclination, in degrees — see rollInclinationDeg. */
	inclinationDeg: number
	/** Longitude of the ascending node, in degrees — where the orbit crosses
	 * the reference (equatorial) plane heading "north". No existing table to
	 * port for this, so it's just a uniform 0–360° roll like the moons use. */
	longitudeOfAscendingNodeDeg: number
	moons: MoonBody[]
	/** EBM internalHeatTempK (residual/formation heat), relevant for gas
	 * giants — see sol-system.ts's SolPlanetSeed.greenhouseFactor doc.
	 * Unset (no known excess) for everything else. */
	internalHeatTempK?: number
	/** Main-world-only terrain generation controls. */
	landDistribution?: number
	continentSizeVariety?: number
	seaLevel?: number
	maxElevation?: number
}

const EPISTELLAR_DEVIATIONS = [2.25, 1.75, 1.25]
const INNER_DEVIATIONS = [0.75, 0, -0.75]
const OUTER_DEVIATIONS = [
	-1.25, -1.75, -2.25, -2.75, -3.25, -3.75, -4, -4.25, -4.5,
]

interface Slot {
	zone: Zone
	deviation: number
	/** True for the single reserved deviation-0 inner slot when
	 * forceMainWorld is set -- see generateSystemBodies. */
	isMainWorld?: boolean
}

function buildBodyEnvironment(params: {
	rng: ReturnType<typeof createRng>
	groupHint?: OrbitGroup
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	diameterKm: number
	massKg: number
	orbitalDistanceAU: number
	isPrimaryWorld: boolean
	isMoon: boolean
	tidal: boolean
	forceMeltball?: boolean
	assignment?: ClassifiedEnvironment
}): Pick<
	SystemBody,
	| "sizeClass"
	| "density"
	| "group"
	| "classification"
	| "subtype"
	| "composition"
	| "chemistry"
	| "hydrosphereCode"
	| "hydrosphere"
	| "landCoverage"
	| "atmosphere"
	| "greenhouseFactor"
	| "albedo"
> {
	const sizeClass =
		params.groupHint === "jovian"
			? estimateGasGiantSizeClass(params.diameterKm)
			: estimateRockySizeClass(params.diameterKm)
	const body = classifyBody({ ...params, sizeClass })
	const environment = buildClassificationEnvironment({
		rng: params.rng,
		group: body.group,
		classification: body.classification,
		sizeClass,
		zone: params.zone,
		deviation: params.deviation,
		spectralClass: params.spectralClass,
		diameterKm: params.diameterKm,
		massKg: params.massKg,
		isPrimaryWorld: params.isPrimaryWorld,
		greenhouseMode: params.isPrimaryWorld ? "estimate" : "roll",
		assignment: params.assignment,
	})
	return {
		sizeClass,
		density: environment.density,
		group: body.group,
		classification: body.classification,
		subtype: environment.subtype,
		composition: environment.composition,
		chemistry: environment.chemistry,
		hydrosphereCode: environment.hydrosphereCode,
		hydrosphere: environment.hydrosphere,
		landCoverage: environment.landCoverage,
		atmosphere: environment.atmosphere,
		greenhouseFactor: environment.greenhouseFactor,
		albedo: environment.albedo,
	}
}

// Ported from galaxy-gen's classify() (orbits/rotation/index.ts) -- rerolls
// atmosphere/hydrosphere/subtype/chemistry for a terrestrial body that just
// became star-locked (see tide-lock.ts's rollPlanetTideLock), the same way
// its real classification's dice table would if it had been rolled that way
// from the start. Density is also recomputed (buildClassificationEnvironment
// always derives it from mass/diameter, which don't change here) rather than
// carried over -- galaxy-gen doesn't touch density on reclassify either,
// since it's independent of classification other than its description label.
function buildForcedClassificationEnvironment(params: {
	rng: ReturnType<typeof createRng>
	classification: "jani-lithic" | "vesperian"
	sizeClass: number
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	diameterKm: number
	massKg: number
	isPrimaryWorld: boolean
}): Pick<
	SystemBody,
	| "sizeClass"
	| "density"
	| "group"
	| "classification"
	| "subtype"
	| "composition"
	| "chemistry"
	| "hydrosphereCode"
	| "hydrosphere"
	| "landCoverage"
	| "atmosphere"
	| "greenhouseFactor"
	| "albedo"
> {
	const environment = buildClassificationEnvironment({
		rng: params.rng,
		group: "terrestrial",
		classification: params.classification,
		sizeClass: params.sizeClass,
		zone: params.zone,
		deviation: params.deviation,
		spectralClass: params.spectralClass,
		diameterKm: params.diameterKm,
		massKg: params.massKg,
		isPrimaryWorld: params.isPrimaryWorld,
		greenhouseMode: params.isPrimaryWorld ? "estimate" : "roll",
	})
	return {
		sizeClass: params.sizeClass,
		density: environment.density,
		group: "terrestrial",
		classification: params.classification,
		subtype: environment.subtype,
		composition: environment.composition,
		chemistry: environment.chemistry,
		hydrosphereCode: environment.hydrosphereCode,
		hydrosphere: environment.hydrosphere,
		landCoverage: environment.landCoverage,
		atmosphere: environment.atmosphere,
		greenhouseFactor: environment.greenhouseFactor,
		albedo: environment.albedo,
	}
}

function buildMoonEnvironment(params: {
	rng: ReturnType<typeof createRng>
	diameterKm: number
	massKg: number
	orbitalDistanceAU: number
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	sizeClass?: number
	isPrimaryWorld: boolean
	orbitRange?: MoonBody["orbitRange"]
	semiMajorAxisPlanetDiameters?: number
}): Pick<
	MoonBody,
	| "sizeClass"
	| "density"
	| "group"
	| "classification"
	| "subtype"
	| "composition"
	| "chemistry"
	| "hydrosphereCode"
	| "hydrosphere"
	| "landCoverage"
	| "atmosphere"
	| "greenhouseFactor"
	| "albedo"
> {
	const sizeClass =
		params.sizeClass ?? estimateRockySizeClass(params.diameterKm)
	const tidal =
		params.orbitRange === "inner" ||
		(params.semiMajorAxisPlanetDiameters ?? Number.POSITIVE_INFINITY) <= 8
	const body = classifyBody({
		groupHint: undefined,
		zone: params.zone,
		orbitalDistanceAU: params.orbitalDistanceAU,
		sizeClass,
		isPrimaryWorld: params.isPrimaryWorld,
		isMoon: true,
		tidal,
	})
	const environment = buildClassificationEnvironment({
		rng: params.rng,
		group: body.group,
		classification: body.classification,
		sizeClass,
		zone: params.zone,
		deviation: params.deviation,
		spectralClass: params.spectralClass,
		diameterKm: params.diameterKm,
		massKg: params.massKg,
		isPrimaryWorld: params.isPrimaryWorld,
	})
	return {
		sizeClass,
		density: environment.density,
		group: body.group,
		classification: body.classification,
		subtype: environment.subtype,
		composition: environment.composition,
		chemistry: environment.chemistry,
		hydrosphereCode: environment.hydrosphereCode,
		hydrosphere: environment.hydrosphere,
		landCoverage: environment.landCoverage,
		atmosphere: environment.atmosphere,
		greenhouseFactor: environment.greenhouseFactor,
		albedo: environment.albedo,
	}
}

const MAX_MOON_ECCENTRICITY_SAFETY_ATTEMPTS = 8

// Ported from galaxy-gen's ORBIT.safeMoonOrbit (orbits/index.ts) -- Hill-
// sphere/Roche spacing (already enforced by generateMoons' own orbit-band
// placement, see orbital-mechanics.ts's morPd/placeMoonOrbits) only keeps a
// moon's orbit geometrically stable; it says nothing about whether that
// orbit's *tidal heating* would tear the moon apart. Rerolls the cheapest
// knob (eccentricity, which the heating formula is most sensitive to) a
// bounded number of times and drops the moon entirely if no safe orbit is
// found, exactly like galaxy-gen's discard-and-reroll loop.
function enforceMoonTidalSafety(
	rng: ReturnType<typeof createRng>,
	parentMassKg: number,
	parentDiameterKm: number,
	moon: MoonBody,
): MoonBody | null {
	const heatingFor = (eccentricity: number) =>
		computeMoonTidalHeatingRaw({
			parentMassKg,
			parentDiameterKm,
			moonDiameterKm: moon.diameterKm,
			moonMassKg: moon.massKg,
			semiMajorAxisPlanetDiameters: moon.semiMajorAxisPlanetDiameters ?? 0,
			orbitalPeriodDays: moon.orbitalPeriodDays,
			eccentricity,
			densityEarthRelative: moon.density?.earthRelative ?? 0,
		})
	let eccentricity = moon.eccentricity
	let heating = heatingFor(eccentricity)
	let attempts = 0
	while (
		heating > MAX_SAFE_MOON_TIDAL_HEATING &&
		attempts < MAX_MOON_ECCENTRICITY_SAFETY_ATTEMPTS
	) {
		eccentricity = rng.uniform(0, eccentricity / 2)
		heating = heatingFor(eccentricity)
		attempts += 1
	}
	if (heating > MAX_SAFE_MOON_TIDAL_HEATING) return null
	return { ...moon, eccentricity }
}

function rollOrbitGroup(
	rng: ReturnType<typeof createRng>,
	zone: Zone,
): OrbitGroup {
	const weights: Record<OrbitGroup, number> =
		zone === "outer"
			? {
					"asteroid belt": 1,
					dwarf: 1,
					terrestrial: 1,
					helian: 0.6,
					jovian: 2,
				}
			: zone === "inner"
				? {
						"asteroid belt": 1,
						dwarf: 1.2,
						terrestrial: 2,
						helian: 0.3,
						jovian: 0.2,
					}
				: {
						"asteroid belt": 0.5,
						dwarf: 1.5,
						terrestrial: 1.3,
						helian: 0.2,
						jovian: 0.1,
					}
	const total = Object.values(weights).reduce((sum, value) => sum + value, 0)
	let roll = rng.uniform(0, total)
	for (const group of [
		"asteroid belt",
		"dwarf",
		"terrestrial",
		"helian",
		"jovian",
	] as const) {
		roll -= weights[group]
		if (roll <= 0) return group
	}
	return "dwarf"
}

function rollSizeClass(
	rng: ReturnType<typeof createRng>,
	group: OrbitGroup,
): number {
	if (group === "asteroid belt") return -1
	if (group === "dwarf") return rng.randint(0, 4)
	if (group === "terrestrial") return rng.randint(5, 10)
	if (group === "helian") return rng.randint(11, 15)
	return rng.randint(16, 18)
}

function rollDiameterKmFromSizeClass(
	rng: ReturnType<typeof createRng>,
	sizeClass: number,
): number {
	if (sizeClass < 0) return 0
	if (sizeClass === 0) return rng.uniform(400, 800)
	if (sizeClass === 1) return rng.uniform(1000, 2000)
	if (sizeClass === 2) return rng.uniform(2800, 3600)
	if (sizeClass === 3) return rng.uniform(4000, 5600)
	if (sizeClass === 4) return rng.uniform(5600, 7200)
	if (sizeClass === 5) return rng.uniform(7200, 8800)
	if (sizeClass === 6) return rng.uniform(8800, 10400)
	if (sizeClass === 7) return rng.uniform(10400, 12000)
	if (sizeClass === 8) return rng.uniform(12000, 13600)
	if (sizeClass === 9) return rng.uniform(13600, 15200)
	if (sizeClass === 10) return rng.uniform(15200, 16800)
	if (sizeClass === 11) return rng.uniform(16800, 18400)
	if (sizeClass === 12) return rng.uniform(18400, 20000)
	if (sizeClass === 13) return rng.uniform(20000, 21600)
	if (sizeClass === 14) return rng.uniform(21600, 23199)
	if (sizeClass === 15) return rng.uniform(23200, 24800)
	if (sizeClass === 16) return rng.uniform(2, 6) * EARTH_DIAMETER_KM
	if (sizeClass === 17) return rng.uniform(6, 12) * EARTH_DIAMETER_KM
	if (sizeClass === 18) return rng.uniform(8, 18) * EARTH_DIAMETER_KM
	const minKm = 1200 + sizeClass * 1600
	const maxKm = minKm + 1600
	return rng.uniform(minKm, maxKm)
}

// Ported from galaxy-gen's getDensityFromTable/calculateDensity (orbits/groups.ts):
// composition (ice/rocky/metallic) picks a weighted density category, then a
// 2d6-2 roll indexes one of 11 specific values within that category -- a
// triangular distribution clustered around the category's middle, instead of
// a flat uniform range.
const DENSITY_TABLE: Record<string, number[]> = {
	"Exotic Ice": [
		0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.24, 0.27, 0.3, 0.33,
	],
	"Mostly Ice": [
		0.18, 0.21, 0.24, 0.27, 0.3, 0.33, 0.36, 0.39, 0.41, 0.44, 0.47,
	],
	"Mostly Rock": [
		0.5, 0.53, 0.56, 0.59, 0.62, 0.65, 0.68, 0.71, 0.74, 0.77, 0.8,
	],
	"Rock and Metal": [
		0.82, 0.85, 0.88, 0.91, 0.94, 0.97, 1.0, 1.03, 1.06, 1.09, 1.12,
	],
	"Mostly Metal": [
		1.15, 1.18, 1.21, 1.24, 1.27, 1.3, 1.33, 1.36, 1.39, 1.42, 1.45,
	],
	"Compressed Metal": [
		1.5, 1.55, 1.6, 1.65, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2.0,
	],
}

type DensityComposition = "ice" | "rocky" | "metallic"

function classificationToComposition(
	classification: OrbitClassification,
): DensityComposition {
	if (
		classification === "snowball" ||
		classification === "panthalassic" ||
		classification === "helian"
	) {
		return "ice"
	}
	if (
		classification === "telluric" ||
		classification === "meltball" ||
		classification === "stygian" ||
		classification === "acheronian" ||
		classification === "asphodelian"
	) {
		return "metallic"
	}
	return "rocky"
}

function rollDensityFromComposition(
	rng: ReturnType<typeof createRng>,
	composition: DensityComposition,
): number {
	const description = rng.weightedChoice([
		{ v: "Exotic Ice", w: composition === "ice" ? 1 : 0 },
		{ v: "Mostly Ice", w: composition === "ice" ? 5 : 0 },
		{ v: "Mostly Rock", w: composition === "rocky" ? 3 : 0 },
		{
			v: "Rock and Metal",
			w: composition === "metallic" || composition === "rocky" ? 4 : 0,
		},
		{ v: "Mostly Metal", w: composition === "metallic" ? 5 : 0 },
		{ v: "Compressed Metal", w: composition === "metallic" ? 1 : 0 },
	])
	const densityRoll = roll2d6(rng) - 2
	return DENSITY_TABLE[description as string][densityRoll]
}

function pickDensityEarthRelative(
	rng: ReturnType<typeof createRng>,
	group: OrbitGroup,
	classification: OrbitClassification,
	composition?: string,
): number {
	if (group === "jovian" || classification === "chthonian") {
		return rng.uniform(0.08, 0.35)
	}
	const densityComposition: DensityComposition =
		composition === "ice" ||
		composition === "rocky" ||
		composition === "metallic"
			? composition
			: classificationToComposition(classification)
	return rollDensityFromComposition(rng, densityComposition)
}

function roll2d6(rng: ReturnType<typeof createRng>): number {
	return rng.randint(1, 6) + rng.randint(1, 6)
}

// Ported from galaxy-gen's MATH.orbits.eccentricity (orbits/index.ts), with
// the star-companion/moon/stellar-age modifiers dropped — none of those
// apply to a plain sibling planet around a lone main-sequence star.
function rollEccentricity(rng: ReturnType<typeof createRng>): number {
	const roll = roll2d6(rng)
	if (roll <= 5) return 0
	if (roll <= 7) return rng.uniform(0.01, 0.03)
	if (roll <= 9) return rng.uniform(0.04, 0.09)
	if (roll <= 10) return rng.uniform(0.1, 0.35)
	if (roll <= 11) return rng.uniform(0.15, 0.65)
	return rng.uniform(0.4, 0.9)
}

// Ported from galaxy-gen's MATH.tilt.compute (non-homeworld branch).
function rollAxialTiltDeg(rng: ReturnType<typeof createRng>): number {
	const standard = roll2d6(rng)
	if (standard <= 4) return rng.uniform(0.01, 0.1)
	if (standard <= 5) return rng.uniform(0.2, 1.2)
	if (standard <= 6) return rng.uniform(1, 6)
	if (standard <= 7) return rng.uniform(7, 12)
	if (standard <= 9) return rng.uniform(10, 35)
	const extreme = rng.randint(1, 6)
	if (extreme <= 2) return rng.uniform(20, 70)
	if (extreme <= 4) return rng.uniform(40, 90)
	if (extreme <= 5) return rng.uniform(91, 126)
	return rng.uniform(144, 180)
}

// Ported from galaxy-gen's orbit.rings roll (orbits/index.ts) -- restricted
// to jovians for now. Galaxy-gen also rolls a 1-in-20 chance of rings for any
// other non-asteroid-belt/non-dwarf body, and only ever allows "complex"
// rings for a jovian; that non-jovian roll isn't ported yet, so every other
// group stays ringless here. The concrete ring geometry/color bands below
// have no galaxy-gen equivalent (it only stores a flavor string, "none" /
// "minor" / "complex" -- rendering real ring geometry is this codebase's own
// addition); authored against Saturn's real values (sol-system.ts's
// SOL_PLANET_RINGS_BY_NAME: inner 1.52, outer 2.08, opacity 0.52) as an
// anchor for "complex", with "minor" scaled down to a fainter, narrower band.
const JOVIAN_RING_COLOR_CHOICES = [0xd8c69a, 0xcac2b0, 0xb8c4cf, 0xa89f8f]

function rollJovianRings(
	rng: ReturnType<typeof createRng>,
): RingProfile | undefined {
	const tier = rng.weightedChoice([
		{ v: "none", w: 6 },
		{ v: "minor", w: 2 },
		{ v: "complex", w: 1 },
	] as const)
	if (!tier || tier === "none") return undefined
	const color =
		JOVIAN_RING_COLOR_CHOICES[
			rng.randint(0, JOVIAN_RING_COLOR_CHOICES.length - 1)
		]!
	const innerRadiusRelative = rng.uniform(1.3, 1.7)
	const outerRadiusRelative =
		innerRadiusRelative +
		(tier === "complex" ? rng.uniform(0.4, 0.7) : rng.uniform(0.15, 0.35))
	const opacity =
		tier === "complex" ? rng.uniform(0.35, 0.6) : rng.uniform(0.12, 0.25)
	return { innerRadiusRelative, outerRadiusRelative, color, opacity }
}

// Ported from galaxy-gen's ROTATION.get — the sidereal-day-length dice
// table, including its stellar-age modifier (older stars' systems roll
// slower base rotations), but without the tidal-lock cascade (locks/effect),
// since decorative siblings don't need the full lock simulation.
function rollSiderealDayHours(
	rng: ReturnType<typeof createRng>,
	isJovian: boolean,
	starAgeGyr: number,
): number {
	const mult = isJovian ? 2 : 4
	const ageMod = Math.floor(starAgeGyr / 2)
	let base = (roll2d6(rng) - 2) * mult + 2 + rng.randint(1, 6) + ageMod
	let rotation = base
	while (base > 40 && rng.randint(1, 6) >= 5) {
		base = (roll2d6(rng) - 2) * mult + rng.randint(1, 6)
		rotation += base
	}
	return rotation * rng.uniform(0.95, 1.05)
}

// Star age is rolled from its own salted rng derived from the same system
// seed, decorrelated from the main body-generation rng sequence (created
// with a fresh `createRng` instance below) so callers (e.g. the UI's star
// stat card) can reproduce the exact same value from just (seed, massSol)
// without needing to replay the whole body-generation sequence.
const STAR_AGE_SEED_SALT = 0x9e3779b1

export function getStarAgeGyr(seed: number, massSol: number): number {
	if (seed === SOL_SEED) return SOL_STAR_AGE_GYR
	const rng = createRng(seed + STAR_AGE_SEED_SALT)
	return rollStarAgeGyr(rng, massSol)
}

/** The star's own name, from the same per-system language every sibling
 * planet/moon in this system is named from (see generateSystemBodies) --
 * spawning the language again here (rather than threading generateSystemBodies'
 * own instance out) is cheap and keeps this callable standalone from the UI
 * wherever just a star label is needed. Sol keeps its real name (SOL_STAR_NAME
 * in sol-system.ts) untouched -- callers should check `seed === SOL_SEED`
 * themselves rather than calling this for Sol. */
export function generateStarName(seed: number): string {
	const lang = LANGUAGE.spawn(`system:${seed}`)
	return LANGUAGE.word.simple({
		lang,
		key: "region",
		namespace: "planet",
		slot: "star",
	}).word
}

function massKgFromEarthRelativeDensity(
	diameterKm: number,
	densityEarthRelative: number,
): number {
	const diameterEarths = diameterKm / EARTH_DIAMETER_KM
	const massEarths = densityEarthRelative * diameterEarths ** 3
	return massEarths * EARTH_MASS_KG
}

// Relative to Earth (see body-metrics.ts's computeGravityG doc) -- G cancels
// out of the ratio, so this is exact instead of drifting off 1.000g at
// Earth's own defaults.
function computeGravityG(massKg: number, diameterKm: number): number {
	const massEarths = massKg / EARTH_MASS_KG
	const diameterEarths = diameterKm / EARTH_DIAMETER_KM
	return massEarths / diameterEarths ** 2
}

/** Only used for the real Sol seed's Earth, whose physical parameters come
 * from the user's live UI sliders (or the real fitted Earth data), not RNG
 * rolls -- everything else (classification, hydrosphere, texture, ...) is
 * fixed the same way it is for every other Sol body, since Earth is hydrated
 * by the exact same buildPlanet() (see buildMainWorldSeed below). A
 * procedurally generated (non-Sol) main world is no longer built from this
 * shape at all -- it's rolled inline alongside its siblings in
 * generateSystemBodies, see the `forceMainWorld` slot below. */
interface HomeWorldParams {
	name?: string
	orbitalDistanceAU: number
	diameterKm: number
	moons: MoonBody[]
	massKg: number
	gravityG: number
	siderealDayHours: number
	eccentricity: number
	longitudeOfPerihelionDeg?: number
	axialTiltDeg: number
	inclinationDeg?: number
	tideLock?: TideLock | null
	substellarLon?: number
	atmosphere?: AtmosphereProfile | null
	landDistribution?: number
	landCoverage?: number
	continentSizeVariety?: number
	seaLevel?: number
	maxElevation?: number
	/** Real fitted values (see sol-system.ts's SOL_MAIN_WORLD_DEFAULTS) --
	 * only supplied when generating the real Sol seed's Earth. A
	 * procedurally generated main world has no "real" albedo (left unset,
	 * same as any other generated body -- the UI estimates one from land
	 * coverage) but still needs a real greenhouseFactor NUMBER (unlike
	 * albedo, the stats UI has no estimate fallback for a missing one), so
	 * that one gets a heuristic estimate when not supplied. */
	albedo?: number
	greenhouseFactor?: number
}

interface GenerateSystemBodiesParams {
	seed: number
	spectralClass: MainSequenceClass
	starSubtype: number
	/** Whether to reserve the temperate (deviation 0) inner slot for a rolled
	 * main world, tagged isMainWorld: true -- deviation 0 is, by construction
	 * (see deviationToAU), always exactly the star's habitable-zone center,
	 * for any star type, so no separate "keep the main world at the HZ
	 * center" bookkeeping is needed elsewhere. When false, no body in the
	 * generated system is tagged isMainWorld. Ignored for the real Sol seed,
	 * which always has Earth. */
	forceMainWorld: boolean
	/** Only consulted for the real Sol seed -- Earth's live-edited slider
	 * values (or real fitted data) to hydrate onto the fixed SOL_SYSTEM_BODIES
	 * table. Ignored for every other seed, where the main world (if any) is
	 * rolled fresh alongside its siblings instead. */
	solMainWorldOverrides?: HomeWorldParams
}

// Builds a live SolPlanetSeed for the main world from the user's current UI
// state -- hydrated by the exact same buildPlanet() every other Sol body
// uses (see sol-system.ts), just from this freshly-built seed instead of a
// fixed table entry. Its deviation/zone is always the temperate slot (see
// the deviation: 0 reservation below), and real Earth data (Bond albedo,
// fitted greenhouseFactor, real inclination/longitude of perihelion) only
// applies when this actually IS Earth (the Sol seed) -- see the SOL_SEED
// branch below, which merges in SOL_MAIN_WORLD_DEFAULTS's real values.
function buildMainWorldSeed(mainWorld: HomeWorldParams): SolPlanetSeed {
	const diameterEarths = mainWorld.diameterKm / EARTH_DIAMETER_KM
	const massEarths = mainWorld.massKg / EARTH_MASS_KG
	const density = buildDensityProfile(
		mainWorld.massKg,
		mainWorld.diameterKm,
		"tectonic",
	)
	const pressureBar = mainWorld.atmosphere?.pressureBar ?? 0
	return {
		name: mainWorld.name,
		isMainWorld: true,
		group: "terrestrial",
		classification: "tectonic",
		au: mainWorld.orbitalDistanceAU,
		diameterEarths,
		massEarths,
		gravityG: mainWorld.gravityG,
		densityEarthRelative: density?.earthRelative ?? 1,
		densityDescription: density?.description ?? "Rock and Metal",
		rotationHours: mainWorld.siderealDayHours,
		tiltDeg: mainWorld.axialTiltDeg,
		eccentricity: mainWorld.eccentricity,
		longitudeOfPerihelionDeg: mainWorld.longitudeOfPerihelionDeg,
		inclinationDeg: mainWorld.inclinationDeg,
		tideLock: mainWorld.tideLock,
		substellarLon: mainWorld.substellarLon,
		atmosphere: mainWorld.atmosphere ?? undefined,
		landDistribution: mainWorld.landDistribution,
		landCoverage:
			mainWorld.landCoverage ?? SOL_MAIN_WORLD_DEFAULTS.landCoverage,
		continentSizeVariety: mainWorld.continentSizeVariety,
		seaLevel: mainWorld.seaLevel,
		maxElevation: mainWorld.maxElevation,
		albedo: mainWorld.albedo,
		greenhouseFactor:
			mainWorld.greenhouseFactor ?? estimateGreenhouseFactor(pressureBar),
	}
}

/**
 * Generates the rest of the (single-star) solar system around the already-
 * generated main world: a handful of sibling asteroid belts/planets/gas
 * giants placed by the same deviation-pool + temperature-derived AU spacing
 * galaxy-gen uses for its star's satellite slots, simplified to drop all
 * companion-star/stellar-age machinery that doesn't apply to a lone
 * main-sequence star. The main world always keeps its real, already-rolled
 * orbitalDistanceAU — siblings are generated around it, never replacing it.
 */
export function generateSystemBodies(
	params: GenerateSystemBodiesParams,
): SystemBody[] {
	const {
		seed,
		spectralClass,
		starSubtype,
		forceMainWorld,
		solMainWorldOverrides,
	} = params
	const rng = createRng(seed)

	if (seed === SOL_SEED) {
		if (!solMainWorldOverrides) {
			throw new Error(
				"generateSystemBodies: Sol seed requires solMainWorldOverrides",
			)
		}
		const mainWorldSeed: SolPlanetSeed = {
			...buildMainWorldSeed(solMainWorldOverrides),
			inclinationDeg:
				solMainWorldOverrides.inclinationDeg ??
				SOL_MAIN_WORLD_DEFAULTS.inclinationDeg,
		}
		return applySystemSeismology({
			bodies: SOL_SYSTEM_BODIES.map((body) =>
				body.isMainWorld
					? buildPlanet(mainWorldSeed, seed, -1, {
							textureOverride: "/sol/earth/2k_earth.jpg",
							moonsOverride: solMainWorldOverrides.moons,
						})
					: body,
			),
			starAgeGyr: SOL_STAR_AGE_GYR,
			starLuminositySol: 1,
			spectralClass,
			...buildSurfaceTidesSeismologyCallbacks({
				spectralClass,
				starSubtype,
			}),
		})
	}

	const luminositySol = getStarLuminositySol(spectralClass, starSubtype)
	const starMassKg = M_SOL_KG

	// Every non-Sol system gets its own procedurally generated language (see
	// LANGUAGE.spawn/planet-name.ts), used to name every sibling planet and
	// moon so a system's bodies read as belonging to one another instead of
	// each carrying an unrelated one-off name. Sol keeps its real, curated
	// names untouched (see the seed === SOL_SEED branch above).
	const systemLanguage = LANGUAGE.spawn(`system:${seed}`)
	const nameBody = (slot: string): string =>
		LANGUAGE.word.simple({
			lang: systemLanguage,
			key: "region",
			namespace: "planet",
			slot,
		}).word

	const epistellarCount = rng.randint(0, 2)
	const innerCount = rng.randint(1, 3)
	const outerCount = rng.randint(1, 5)

	const slots: Slot[] = [
		...rng
			.sample(EPISTELLAR_DEVIATIONS, epistellarCount)
			.map((deviation) => ({ zone: "epistellar" as const, deviation })),
		// One inner slot is reserved for the main world (deviation 0, the
		// "temperate" slot -- always exactly the HZ center, see deviationToAU)
		// when forceMainWorld is set -- same guarantee galaxy-gen gives its
		// homeworld. It's rolled through the exact same pipeline as any other
		// slot below, just tagged isMainWorld/isPrimaryWorld true.
		...(forceMainWorld
			? [{ zone: "inner" as const, deviation: 0, isMainWorld: true }]
			: []),
		...rng
			.sample(
				forceMainWorld
					? INNER_DEVIATIONS.filter((d) => d !== 0)
					: INNER_DEVIATIONS,
				forceMainWorld ? Math.max(0, innerCount - 1) : innerCount,
			)
			.map((deviation) => ({ zone: "inner" as const, deviation })),
		...rng
			.sample(OUTER_DEVIATIONS, outerCount)
			.map((deviation) => ({ zone: "outer" as const, deviation })),
	]

	const starMassSol = getStarMassSol(spectralClass, starSubtype)
	const starAgeGyr = getStarAgeGyr(seed, starMassSol)

	// Ported from galaxy-gen's non-homeworld "primary" bias (orbits/index.ts)
	// -- even a system with no forced main world still gets one significant,
	// habitability-biased sibling: whichever slot sits closest to the star's
	// temperate (deviation 0) center, as long as that's an inner-zone slot
	// (an epistellar/outer "closest" pick just means this system has no
	// primary, same as galaxy-gen). Skipped entirely when forceMainWorld
	// already reserves the deviation-0 inner slot for an actual playable
	// homeworld.
	let primarySlotIndex: number | undefined
	if (!forceMainWorld && slots.length > 0) {
		let closestIndex = 0
		for (let i = 1; i < slots.length; i++) {
			if (
				Math.abs(slots[i]!.deviation) < Math.abs(slots[closestIndex]!.deviation)
			) {
				closestIndex = i
			}
		}
		if (slots[closestIndex]!.zone === "inner") primarySlotIndex = closestIndex
	}

	const bodies: SystemBody[] = slots.map((slot, siblingIdx) => {
		const isMainWorld = slot.isMainWorld === true
		const isPrimaryWorld = isMainWorld || siblingIdx === primarySlotIndex
		let group = rollOrbitGroup(rng, slot.zone)
		// A main world can't be an asteroid belt (no surface to generate
		// terrain on) -- reroll until it isn't. Low-probability in the inner
		// zone already, so this terminates quickly.
		while (isMainWorld && group === "asteroid belt") {
			group = rollOrbitGroup(rng, slot.zone)
		}
		let orbitalDistanceAU = deviationToAU(slot.deviation, luminositySol)
		// Ported from galaxy-gen's forced-meltball roll (orbits/index.ts) -- a
		// close-in epistellar dwarf beyond the star's dust-clearing boundary
		// (getStarMAO) can get shoved into a scorching orbit instead of
		// forming further out. Only ever checked for the very first slot in
		// generation order (mirroring galaxy-gen's firstStarOrbit gate) and
		// never for the main world.
		let forceMeltball = false
		if (
			siblingIdx === 0 &&
			!isMainWorld &&
			slot.zone === "epistellar" &&
			group === "dwarf" &&
			rng.uniform(0, 1) <= 0.2
		) {
			const candidateAu = auFromTemperature(
				rng.uniform(1000, 2000),
				luminositySol,
			)
			const maoAu = getStarMAO(spectralClass, starSubtype)
			if (candidateAu > maoAu) {
				forceMeltball = true
				orbitalDistanceAU = candidateAu
			}
		}
		// A primary/main world is meant to be a significant, habitable-scale
		// body -- floor its rolled size the way galaxy-gen floors `size` to
		// at least 2 for its own primary designation, adapted to our
		// terrestrial-sized (5-10) sizeClass band since classifyBody always
		// reclassifies an isPrimaryWorld body to group "terrestrial".
		const sizeClass = isPrimaryWorld
			? Math.max(rollSizeClass(rng, group), 5)
			: rollSizeClass(rng, group)
		const classification = classifyBody({
			groupHint: group,
			zone: slot.zone,
			orbitalDistanceAU,
			sizeClass,
			isPrimaryWorld,
			isMoon: false,
			tidal: false,
			forceMeltball,
		}).classification
		const assignment = rollClassificationAssignment({
			rng,
			classification,
			sizeClass,
			zone: slot.zone,
			deviation: slot.deviation,
			spectralClass,
			isPrimaryWorld,
		})
		const diameterKm = rollDiameterKmFromSizeClass(rng, sizeClass)
		const densityEarthRelative =
			group === "asteroid belt"
				? 0
				: pickDensityEarthRelative(
						rng,
						group,
						classification,
						assignment.composition,
					)
		const massKg =
			group === "asteroid belt"
				? 0
				: massKgFromEarthRelativeDensity(diameterKm, densityEarthRelative)
		// Rolled here (rather than down with this body's other physical
		// properties, where it conceptually belongs) because generateMoons()
		// below needs THIS body's own day length as its Kepler day-length
		// basis -- passing the main world's hoursPerDay there instead used to
		// silently mis-scale every sibling planet's own moons' orbital periods.
		// This is the pre-tide-lock "natural" rotation baseline -- see
		// rollPlanetTideLock below, which may override it entirely.
		const siderealDayHours =
			group === "asteroid belt"
				? 0
				: rollSiderealDayHours(rng, group === "jovian", starAgeGyr)
		// Moved up from this body's other orbital elements (previously rolled
		// inline in the returned object below) because rollPlanetTideLock needs
		// them as pre-lock inputs -- its own DM/roll may still adjust them
		// further (circularizing eccentricity, flattening or flipping tilt).
		const orbitalPeriodDays =
			getKeplerYearYears(orbitalDistanceAU, starMassSol) * DAYS_PER_YEAR
		const eccentricity = group === "asteroid belt" ? 0 : rollEccentricity(rng)
		const rolledAxialTiltDeg =
			group === "asteroid belt" ? 0 : rollAxialTiltDeg(rng)
		const moonCount =
			group === "asteroid belt"
				? 0
				: rollMoonCountForParent(rng, group, sizeClass, orbitalDistanceAU)
		const moonSlotName = isMainWorld ? "main" : `orbit-${siblingIdx}`
		const moons =
			moonCount > 0
				? generateMoons(
						moonCount,
						rng.randint(1, 1_000_000_000),
						diameterKm / 2,
						orbitalDistanceAU,
						siderealDayHours,
						starMassKg,
						group,
					)
						.map((moon, moonIdx) => {
							const moonEnvironment = buildMoonEnvironment({
								rng,
								diameterKm: moon.diameterKm,
								massKg: moon.massKg,
								orbitalDistanceAU,
								zone: slot.zone,
								deviation: slot.deviation,
								spectralClass,
								sizeClass: moon.sizeClass,
								isPrimaryWorld,
								orbitRange: moon.orbitRange,
								semiMajorAxisPlanetDiameters: moon.semiMajorAxisPlanetDiameters,
							})
							// Ported from galaxy-gen's ROTATION.locks.get's per-moon loop
							// (see tide-lock.ts's rollMoonTideLock) -- may override this
							// moon's rotation/tilt/eccentricity with a partial spin-down, a
							// 3:2 resonance, or a full 1:1 lock to ITS planet. Runs before
							// enforceMoonTidalSafety below so the safety check validates the
							// post-lock (often circularized, lower-heating) orbit. The
							// resulting tideLock itself isn't set here -- attachParentTideLocks
							// below infers it from whether siderealDayHours ended up equal to
							// the orbital period, which a 1:1 lock result always does.
							const moonTideLock = rollMoonTideLock({
								rng,
								sizeClass: moonEnvironment.sizeClass,
								eccentricity: moon.eccentricity,
								axialTiltDeg: moon.axialTiltDeg,
								atmospherePressureBar:
									moonEnvironment.atmosphere?.pressureBar ?? 0,
								starAgeGyr,
								semiMajorAxisPlanetDiameters:
									moon.semiMajorAxisPlanetDiameters ?? 0,
								orbitalPeriodDays: moon.orbitalPeriodDays,
								planetMassEarths: massKg / EARTH_MASS_KG,
								baseSiderealDayHours: moon.siderealDayHours,
								rerollEccentricity: () =>
									rollMoonEccentricity(
										rng,
										moon.orbitRange ?? "middle",
										moonEnvironment.sizeClass,
									),
							})
							return enforceMoonTidalSafety(rng, massKg, diameterKm, {
								...moon,
								// Spread after `moon` so its real classification-derived
								// atmosphere/group/density wins over generateMoons()'s bare
								// vacuum-atmosphere fallback (and its own sizeClass estimate,
								// now told about the roll already made, wins too).
								...moonEnvironment,
								siderealDayHours: moonTideLock.siderealDayHours,
								axialTiltDeg: moonTideLock.axialTiltDeg,
								eccentricity: moonTideLock.eccentricity,
								// A rolled moon gets its OWN classification-based texture here
								// -- it must never inherit SOL_LUNA_DEFAULT's photo. Only when
								// its classification has no matching generated art (not in
								// GENERATED_TEXTURE_FILES) does it fall through moon-orbit-
								// overlay.ts's untextured branch, which happens to reuse Luna's
								// moon.jpg as a generic gray placeholder -- a pre-existing,
								// unrelated renderer default, not something this assigns.
								texturePath: pickGeneratedTexturePath(
									rng,
									moonEnvironment.classification,
								),
								name: nameBody(`${moonSlotName}-moon-${moonIdx}`),
							})
						})
						.filter((moon): moon is MoonBody => moon !== null)
				: []
		const idx = isMainWorld ? -1 : siblingIdx
		const moonsWithTideLocks = attachParentTideLocks(moons, idx).map(
			(moon) => ({
				...moon,
				tideLockStatus: deriveTideLockStatus({
					siderealDayHours: moon.siderealDayHours,
					orbitalPeriodDays: moon.orbitalPeriodDays,
					tideLock: moon.tideLock,
				}),
			}),
		)
		const environment = buildBodyEnvironment({
			rng,
			groupHint: group,
			zone: slot.zone,
			deviation: slot.deviation,
			spectralClass,
			diameterKm,
			massKg,
			orbitalDistanceAU,
			isPrimaryWorld,
			isMoon: false,
			tidal: false,
			forceMeltball,
			assignment,
		})
		// Ported from galaxy-gen's ROTATION.locks.get (see tide-lock.ts) -- may
		// override this body's rotation/tilt/eccentricity entirely (a partial
		// spin-down, a 3:2 resonance, or a full 1:1 lock to its star or to one
		// of its own already-planet-locked moons). Never applies to an asteroid
		// belt, which has no rotation of its own to lock.
		let finalSiderealDayHours = siderealDayHours
		let finalAxialTiltDeg = rolledAxialTiltDeg
		let finalEccentricity = eccentricity
		let tideLock: TideLock | null = null
		let finalEnvironment = environment
		if (group !== "asteroid belt") {
			const tideLockResult = rollPlanetTideLock({
				rng,
				sizeClass,
				eccentricity,
				axialTiltDeg: rolledAxialTiltDeg,
				atmospherePressureBar: environment.atmosphere?.pressureBar ?? 0,
				starAgeGyr,
				starMassSol,
				orbitalDistanceAU,
				orbitalPeriodDays,
				baseSiderealDayHours: siderealDayHours,
				moons: moonsWithTideLocks,
				homeworld: isMainWorld,
				rerollEccentricity: () => rollEccentricity(rng),
			})
			finalSiderealDayHours = tideLockResult.siderealDayHours
			finalAxialTiltDeg = tideLockResult.axialTiltDeg
			finalEccentricity = tideLockResult.eccentricity
			tideLock = tideLockResult.tideLock
			if (
				tideLockResult.starLocked &&
				environment.group === "terrestrial" &&
				environment.classification !== "acheronian"
			) {
				finalEnvironment = buildForcedClassificationEnvironment({
					rng,
					classification:
						slot.zone === "epistellar" ? "jani-lithic" : "vesperian",
					sizeClass,
					zone: slot.zone,
					deviation: slot.deviation,
					spectralClass,
					diameterKm,
					massKg,
					isPrimaryWorld,
				})
			}
		}
		return {
			...finalEnvironment,
			idx,
			seed: isMainWorld ? "main-world" : `orbit-${siblingIdx + 1}`,
			name: nameBody(isMainWorld ? "main-world" : `orbit-${siblingIdx}`),
			isMainWorld,
			zone: slot.zone,
			texturePath: pickGeneratedTexturePath(
				rng,
				finalEnvironment.classification,
			),
			rings:
				finalEnvironment.group === "jovian" ? rollJovianRings(rng) : undefined,
			orbitalDistanceAU,
			diameterKm,
			massKg,
			gravityG:
				group === "asteroid belt" ? 0 : computeGravityG(massKg, diameterKm),
			orbitalPeriodDays,
			siderealDayHours: finalSiderealDayHours,
			eccentricity: finalEccentricity,
			longitudeOfPerihelionDeg: rng.uniform(0, 360),
			axialTiltDeg: finalAxialTiltDeg,
			inclinationDeg: group === "asteroid belt" ? 0 : rollInclinationDeg(rng),
			longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
			tideLock,
			tideLockStatus: deriveTideLockStatus({
				siderealDayHours: finalSiderealDayHours,
				orbitalPeriodDays,
				tideLock,
			}),
			substellarLon:
				tideLock?.type === "solar" ? rng.uniform(0, 360) : undefined,
			moons: moonsWithTideLocks,
			// Terrain-generation-only fields, meaningless for anything but the
			// main world -- set to Earth's own defaults (not rolled) per
			// SOL_MAIN_WORLD_DEFAULTS/the UI's DEFAULT_WORLD_PARAMS, since the
			// player edits these by hand afterward via the normal sliders.
			...(isMainWorld
				? {
						landDistribution: 1 - SOL_MAIN_WORLD_DEFAULTS.landConcentration,
						continentSizeVariety: EARTH_DEFAULT_CONTINENT_SIZE_VARIETY,
						seaLevel: SOL_MAIN_WORLD_DEFAULTS.seaLevel,
						maxElevation: SOL_MAIN_WORLD_DEFAULTS.maxElevation,
					}
				: {}),
		}
	})

	return applySystemSeismology({
		bodies: bodies.sort((a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU),
		starAgeGyr,
		starLuminositySol: luminositySol,
		spectralClass,
		...buildSurfaceTidesSeismologyCallbacks({
			spectralClass,
			starSubtype,
		}),
	})
}
