import type {
	AtmosphereProfile,
	MoonParams,
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
} from "@/model/celestial/moons/orbital-mechanics"
import {
	getKeplerYearYears,
	getStarLuminositySol,
	getStarMassSol,
	type MainSequenceClass,
	rollStarAgeGyr,
} from "@/model/celestial/star/star-types"
import { estimateGreenhouseFactor } from "@/model/climate/ebm/greenhouse-estimate"
import { buildSurfaceTidesSeismologyCallbacks } from "@/model/climate/tidal-schedule"
import { createRng } from "@/model/shared/rng"
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
	buildClassificationEnvironment,
	buildDensityProfile,
	classifyBody,
	type DensityProfile,
	deviationToAU,
	type OrbitClassification,
	type OrbitGroup,
	type Zone,
} from "./system-environment"
import {
	applySystemSeismology,
	type SeismologyProfile,
} from "./system-seismology"

const GRAVITATIONAL_CONSTANT = 6.674e-11
const STANDARD_GRAVITY_MS2 = 9.807
const DAYS_PER_YEAR = 365.25
const EARTH_DIAMETER_KM = 12_742
const EARTH_MASS_KG = 5.973886146404331e24

interface RingProfile {
	innerRadiusRelative: number
	outerRadiusRelative: number
	color: number
	opacity: number
}

export interface SystemBody {
	/** Stable identifier for this body within the system -- the main world is
	 * always -1; siblings/preset planets get non-negative indices. Lets a
	 * moon's tideLock reference "my parent" without embedding an object
	 * reference. See attachParentTideLocks. */
	idx: number
	name?: string
	sizeClass: number
	density: DensityProfile | null
	group: OrbitGroup
	classification: OrbitClassification
	texturePath?: string
	rings?: RingProfile
	hydrosphereFraction: number
	atmosphere: AtmosphereProfile | null
	isMainWorld: boolean
	orbitalDistanceAU: number
	/** 0 / unused for asteroid belts. */
	diameterKm: number
	/** 0 / unused for asteroid belts. */
	massKg: number
	/** 0 / unused for asteroid belts. */
	gravityG: number
	orbitalPeriodDays: number
	/** Sidereal rotation period (relative to the stars, not the sun) — 0 /
	 * unused for asteroid belts. */
	siderealDayHours: number
	eccentricity: number
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
	moons: MoonParams[]
	/** What (if anything) this body is tidally locked to. Undefined/null when
	 * not locked to anything. */
	tideLock?: TideLock | null
	/** Bond albedo, 0..1 — real measured value where known, otherwise unset. */
	albedo?: number
	/** EBM greenhouseFactor, individually fit per body — see
	 * sol-system.ts's SolPlanetSeed.greenhouseFactor doc. Unset elsewhere. */
	greenhouseFactor?: number
	/** EBM internalHeatTempK (residual/formation heat), relevant for gas
	 * giants — see sol-system.ts's SolPlanetSeed.greenhouseFactor doc.
	 * Unset (no known excess) for everything else. */
	internalHeatTempK?: number
	/** Longitude of the substellar point (the spot on the surface directly
	 * facing the star), in degrees 0-360 — only meaningful when tideLock is
	 * set. Defaults to 0° when unset. */
	substellarLon?: number
	seismology?: SeismologyProfile
}

const EPISTELLAR_DEVIATIONS = [2.25, 1.75, 1.25]
const INNER_DEVIATIONS = [0.75, 0, -0.75]
const OUTER_DEVIATIONS = [
	-1.25, -1.75, -2.25, -2.75, -3.25, -3.75, -4, -4.25, -4.5,
]

interface Slot {
	zone: Zone
	deviation: number
}

function buildBodyEnvironment(params: {
	rng: ReturnType<typeof createRng>
	groupHint?: OrbitGroup
	zone: Zone
	deviation: number
	diameterKm: number
	massKg: number
	orbitalDistanceAU: number
	isPrimaryWorld: boolean
	isMoon: boolean
	tidal: boolean
}): Pick<
	SystemBody,
	| "sizeClass"
	| "density"
	| "group"
	| "classification"
	| "hydrosphereFraction"
	| "atmosphere"
	| "greenhouseFactor"
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
		deviation: params.deviation,
		diameterKm: params.diameterKm,
		massKg: params.massKg,
		isPrimaryWorld: params.isPrimaryWorld,
		greenhouseMode: params.isPrimaryWorld ? "estimate" : "roll",
	})
	return {
		sizeClass,
		density: environment.density,
		group: body.group,
		classification: body.classification,
		hydrosphereFraction: environment.hydrosphereFraction,
		atmosphere: environment.atmosphere,
		greenhouseFactor: environment.greenhouseFactor,
	}
}

function buildMoonEnvironment(params: {
	rng: ReturnType<typeof createRng>
	diameterKm: number
	massKg: number
	orbitalDistanceAU: number
	zone: Zone
	deviation: number
	sizeClass?: number
	isPrimaryWorld: boolean
	orbitRange?: MoonParams["orbitRange"]
	semiMajorAxisPlanetDiameters?: number
}): Pick<
	MoonParams,
	| "sizeClass"
	| "densityEarthRelative"
	| "densityDescription"
	| "group"
	| "classification"
	| "hydrosphereFraction"
	| "atmosphere"
	| "greenhouseFactor"
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
		deviation: params.deviation,
		diameterKm: params.diameterKm,
		massKg: params.massKg,
		isPrimaryWorld: params.isPrimaryWorld,
	})
	return {
		sizeClass,
		densityEarthRelative: environment.density?.earthRelative,
		densityDescription: environment.density?.description,
		group: body.group,
		classification: body.classification,
		hydrosphereFraction: environment.hydrosphereFraction,
		atmosphere: environment.atmosphere,
		greenhouseFactor: environment.greenhouseFactor,
	}
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
	if (sizeClass === 16) return rng.uniform(2, 6) * EARTH_DIAMETER_KM
	if (sizeClass === 17) return rng.uniform(6, 12) * EARTH_DIAMETER_KM
	if (sizeClass === 18) return rng.uniform(8, 18) * EARTH_DIAMETER_KM
	const minKm = 1200 + sizeClass * 1600
	const maxKm = minKm + 1600
	return rng.uniform(minKm, maxKm)
}

function pickDensityEarthRelative(
	rng: ReturnType<typeof createRng>,
	group: OrbitGroup,
	classification: OrbitClassification,
): number {
	if (group === "jovian" || classification === "chthonian") {
		return rng.uniform(0.08, 0.35)
	}
	if (
		classification === "snowball" ||
		classification === "panthalassic" ||
		classification === "helian"
	) {
		return rng.uniform(0.2, 0.6)
	}
	if (
		classification === "rockball" ||
		classification === "geo-cyclic" ||
		classification === "arid" ||
		classification === "tectonic" ||
		classification === "oceanic" ||
		classification === "vesperian"
	) {
		return rng.uniform(0.55, 1.05)
	}
	if (
		classification === "telluric" ||
		classification === "meltball" ||
		classification === "stygian" ||
		classification === "acheronian" ||
		classification === "asphodelian"
	) {
		return rng.uniform(0.9, 1.5)
	}
	return rng.uniform(0.6, 1.2)
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

function massKgFromEarthRelativeDensity(
	diameterKm: number,
	densityEarthRelative: number,
): number {
	const diameterEarths = diameterKm / EARTH_DIAMETER_KM
	const massEarths = densityEarthRelative * diameterEarths ** 3
	return massEarths * EARTH_MASS_KG
}

function computeGravityG(massKg: number, diameterKm: number): number {
	const radiusM = (diameterKm / 2) * 1000
	return (GRAVITATIONAL_CONSTANT * massKg) / radiusM ** 2 / STANDARD_GRAVITY_MS2
}

/** The main world's raw physical parameters come from the user's live UI
 * sliders, not RNG rolls — everything else (classification, atmosphere,
 * density, greenhouse factor, ...) is derived via the same
 * buildBodyEnvironment() path every sibling planet uses. */
/** The main world's raw physical parameters come from the user's live UI
 * sliders, not RNG rolls -- everything else (classification, hydrosphere,
 * texture, ...) is fixed the same way it is for every other Sol body, since
 * the main world is hydrated by the exact same buildPlanet() (see
 * buildMainWorldSeed below). */
interface HomeWorldParams {
	name?: string
	orbitalDistanceAU: number
	diameterKm: number
	moons: MoonParams[]
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
	mainWorld: HomeWorldParams
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
		hydrosphereFraction: 0.71,
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
	const { seed, spectralClass, starSubtype, mainWorld } = params
	const rng = createRng(seed)

	if (seed === SOL_SEED) {
		const mainWorldSeed: SolPlanetSeed = {
			...buildMainWorldSeed(mainWorld),
			inclinationDeg:
				mainWorld.inclinationDeg ?? SOL_MAIN_WORLD_DEFAULTS.inclinationDeg,
		}
		return applySystemSeismology({
			bodies: [
				...SOL_SYSTEM_BODIES,
				buildPlanet(mainWorldSeed, seed, -1, {
					textureOverride: "/sol/earth/2k_earth.jpg",
					moonsOverride: mainWorld.moons,
				}),
			].sort((a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU),
			starAgeGyr: SOL_STAR_AGE_GYR,
			starLuminositySol: 1,
			...buildSurfaceTidesSeismologyCallbacks({
				spectralClass,
				starSubtype,
			}),
		})
	}

	const luminositySol = getStarLuminositySol(spectralClass, starSubtype)
	const starMassKg = M_SOL_KG

	const epistellarCount = rng.randint(0, 2)
	const innerCount = rng.randint(1, 3)
	const outerCount = rng.randint(1, 5)

	const slots: Slot[] = [
		...rng
			.sample(EPISTELLAR_DEVIATIONS, epistellarCount)
			.map((deviation) => ({ zone: "epistellar" as const, deviation })),
		// One inner slot is reserved for the main world (deviation 0, the
		// "temperate" slot) — same guarantee galaxy-gen gives its homeworld.
		...rng
			.sample(
				INNER_DEVIATIONS.filter((d) => d !== 0),
				Math.max(0, innerCount - 1),
			)
			.map((deviation) => ({ zone: "inner" as const, deviation })),
		...rng
			.sample(OUTER_DEVIATIONS, outerCount)
			.map((deviation) => ({ zone: "outer" as const, deviation })),
	]

	const starMassSol = getStarMassSol(spectralClass, starSubtype)
	const starAgeGyr = getStarAgeGyr(seed, starMassSol)

	const siblings: SystemBody[] = slots.map((slot, siblingIdx) => {
		const orbitalDistanceAU = deviationToAU(slot.deviation, luminositySol)
		const group = rollOrbitGroup(rng, slot.zone)
		const sizeClass = rollSizeClass(rng, group)
		const classification = classifyBody({
			groupHint: group,
			zone: slot.zone,
			orbitalDistanceAU,
			sizeClass,
			isPrimaryWorld: false,
			isMoon: false,
			tidal: false,
		}).classification
		const diameterKm = rollDiameterKmFromSizeClass(rng, sizeClass)
		const densityEarthRelative =
			group === "asteroid belt"
				? 0
				: pickDensityEarthRelative(rng, group, classification)
		const massKg =
			group === "asteroid belt"
				? 0
				: massKgFromEarthRelativeDensity(diameterKm, densityEarthRelative)
		// Rolled here (rather than down with this body's other physical
		// properties, where it conceptually belongs) because generateMoons()
		// below needs THIS body's own day length as its Kepler day-length
		// basis -- passing the main world's hoursPerDay there instead used to
		// silently mis-scale every sibling planet's own moons' orbital periods.
		const siderealDayHours =
			group === "asteroid belt"
				? 0
				: rollSiderealDayHours(rng, group === "jovian", starAgeGyr)
		const moonCount =
			group === "asteroid belt"
				? 0
				: rollMoonCountForParent(rng, group, sizeClass, orbitalDistanceAU)
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
					).map((moon) => ({
						...moon,
						// Spread after `moon` so its real classification-derived
						// atmosphere/group/density wins over generateMoons()'s bare
						// vacuum-atmosphere fallback (and its own sizeClass estimate,
						// now told about the roll already made, wins too).
						...buildMoonEnvironment({
							rng,
							diameterKm: moon.diameterKm,
							massKg: moon.massKg,
							orbitalDistanceAU,
							zone: slot.zone,
							deviation: slot.deviation,
							sizeClass: moon.sizeClass,
							isPrimaryWorld: false,
							orbitRange: moon.orbitRange,
							semiMajorAxisPlanetDiameters: moon.semiMajorAxisPlanetDiameters,
						}),
					}))
				: []
		const moonsWithTideLocks = attachParentTideLocks(moons, siblingIdx)
		const environment = buildBodyEnvironment({
			rng,
			groupHint: group,
			zone: slot.zone,
			deviation: slot.deviation,
			diameterKm,
			massKg,
			orbitalDistanceAU,
			isPrimaryWorld: false,
			isMoon: false,
			tidal: false,
		})
		return {
			...environment,
			idx: siblingIdx,
			isMainWorld: false,
			orbitalDistanceAU,
			diameterKm,
			massKg,
			gravityG:
				group === "asteroid belt" ? 0 : computeGravityG(massKg, diameterKm),
			orbitalPeriodDays:
				getKeplerYearYears(orbitalDistanceAU, starMassSol) * DAYS_PER_YEAR,
			siderealDayHours,
			eccentricity: group === "asteroid belt" ? 0 : rollEccentricity(rng),
			longitudeOfPerihelionDeg: rng.uniform(0, 360),
			axialTiltDeg: group === "asteroid belt" ? 0 : rollAxialTiltDeg(rng),
			inclinationDeg: group === "asteroid belt" ? 0 : rollInclinationDeg(rng),
			longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
			moons: moonsWithTideLocks,
		}
	})

	const mainBody = buildPlanet(buildMainWorldSeed(mainWorld), seed, -1, {
		starMassSol,
		moonsOverride: mainWorld.moons,
	})

	return applySystemSeismology({
		bodies: [...siblings, mainBody].sort(
			(a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU,
		),
		starAgeGyr,
		starLuminositySol: luminositySol,
		...buildSurfaceTidesSeismologyCallbacks({
			spectralClass,
			starSubtype,
		}),
	})
}
