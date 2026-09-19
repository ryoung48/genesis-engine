import type { MoonBody } from "@/model/celestial/moons/types"
import type {
	AtmosphereProfile,
	TideLock,
} from "@/model/celestial/orbit-body/types"
import type {
	HostStarAttributes,
	MainSequenceClass,
} from "@/model/celestial/star/types"
import type { OrbitSlot } from "@/model/celestial/system/generation/orbit-placement/types"

/** Inputs used to hydrate the authored Sol main world or a generated world. */
export interface HomeWorldParams {
	/** The procedural main world is named after construction; Sol supplies
	 * Earth's authored name. */
	name?: string
	orbitalDistanceAU: number
	diameterKm: number
	moons: MoonBody[]
	massKg: number
	gravityG: number
	siderealDayHours: number
	eccentricity: number
	/** Only real Sol data supplies this stable orbital element. */
	longitudeOfPerihelionDeg?: number
	/** EBM seasonal-insolation input, in the body's Ls frame. */
	lsAphelionDeg: number
	axialTiltDeg: number
	/** Only real Sol data supplies this stable orbital element. */
	inclinationDeg?: number
	/** Usually absent because a newly generated main world starts unlocked. */
	tideLock?: TideLock | null
	/** Meaningful only for a supplied tide lock. */
	substellarLon?: number
	/** A live UI atmosphere is absent until the user has authored one. */
	atmosphere?: AtmosphereProfile | null
	/** Terrain controls are absent until the main-world editor supplies them. */
	landDistribution?: number
	landCoverage?: number
	continentSizeVariety?: number
	seaLevel?: number
	maxElevation?: number
	/** Real fitted values are only supplied when generating the real Sol seed's
	 * Earth. */
	albedo?: number
	greenhouseFactor?: number
}

/** How the temperate deviation-0 slot (the star's habitable-zone center) is
 * built for the main world -- see generateSystemBodies' isMainWorld branch.
 * "earth-clone": a literal Earth/Luna clone, unchanged from every other slot.
 * "moon-system": the same literal Earth clone, but with a procedurally
 * rolled moon system instead of a single Luna clone.
 * "gas-giant-moon": the slot becomes a jovian (forced to the HZ center, with
 * Earth's eccentricity/rotation) whose normally-rolled moon system has one
 * moon promoted to be the main world instead.
 * "procedural": no slot is reserved at all -- deviation-0 is just another
 * inner-zone candidate, rolled the same as every other slot. Use this for
 * unconstrained generation (e.g. galaxy-scale systems) where no body should
 * be singled out as a guaranteed habitable "home world".
 * "temperate-native": reserves the deviation-0 slot like the non-procedural
 * modes, but builds it as a NORMALLY ROLLED body forced into
 * guaranteed-habitable ranges (tectonic, standard non-tainted atmosphere,
 * sane tilt/eccentricity/rotation, liquid hydrosphere) -- a real roll, not
 * an Earth clone. Used for galaxy nation-capital primary stars. */
export type MainWorldMode =
	| "earth-clone"
	| "moon-system"
	| "gas-giant-moon"
	| "procedural"
	| "temperate-native"

export interface GenerateSystemBodiesParams {
	seed: number
	/** The already-rolled physical host star. Galaxy generation supplies this
	 * so planetary physics uses its actual attributes rather than a
	 * main-sequence approximation. [JUSTIFICATION] The authored single-system
	 * editor intentionally exposes only class/subtype, so it has no rolled
	 * profile to supply. */
	hostStar?: HostStarAttributes
	/** True for a bound companion star. [JUSTIFICATION] Single-star generation
	 * has no parent, while galaxy generation needs galaxy-gen's independent
	 * secondary-no-planets roll. */
	hasParent?: boolean
	/** True when this star is itself an "epistellar" companion (galaxy-gen's
	 * closest-orbiting companion role, 1.5-2.5 HZ-deviation from its parent --
	 * see ROLE_DEVIATION_RANGE in galaxy/systems/index.ts). An orbit that
	 * close to another star is too perturbed for planets of its own to hold
	 * stable orbits, so such a star unconditionally gets none -- see the
	 * epistellarCompanion branch below. */
	isEpistellarCompanion?: boolean
	/** Hill-sphere stability ceiling (AU) beyond which this star's own gravity
	 * no longer dominates over its closest stellar neighbor's -- see the book's
	 * Available Orbits "Alternate Multi-Star Orbit Determination" (pp. 40-41)
	 * and GALAXY_SYSTEMS.computeMaxOrbitalDistanceAU, which derives it from the
	 * real star tree. [JUSTIFICATION] Only a multi-star caller (GALAXY_SYSTEMS)
	 * has other stars to derive this from; every other caller is a single-star
	 * system with no ceiling to apply. */
	maxOrbitalDistanceAU?: number
	/** This star's own direct-child companion stars' separation bands (AU) --
	 * used for the book's Significant Moon Quantity DM ("planet is an orbital
	 * slot adjacent to a companion" / "adjacent to a Close or Near star
	 * unavailability range," p. 54). [JUSTIFICATION] Only a multi-star caller
	 * (GALAXY_SYSTEMS) has companion stars to derive this from; every other
	 * caller has none. */
	companionExclusionZonesAU?: { minAU: number; maxAU: number }[]
	/** [JUSTIFICATION] The standalone and authored-system callers have no
	 * Stage 2-9 allocation yet; galaxy generation supplies the completed slots. */
	orbitSlots?: OrbitSlot[]
	/** Overrides the traditional G2V Sol-equivalent star every generated
	 * system otherwise gets -- omit for that default. */
	spectralClass?: MainSequenceClass
	starSubtype?: number
	/** How the temperate deviation-0 slot is built -- always reserves that
	 * slot for a main world (see MainWorldMode). */
	mainWorldMode: MainWorldMode
	/** Pins the baseline slot to the exact habitable-zone center instead of
	 * the book's rolled variance around it -- the wiki dice-button path sets
	 * this so its forced main world always lands at deviation 0. */
	exactHZC: boolean
	/** Only consulted for the real Sol seed; ignored for other seeds. */
	solMainWorldOverrides?: HomeWorldParams
	/** Star mass used for moon-placement physics (Hill-sphere/orbit spacing).
	 * [JUSTIFICATION] Defaults to a Sol-mass star when omitted -- existing
	 * callers rely on that default and must keep getting it unchanged; only a
	 * caller generating many systems with varying rolled spectral classes
	 * (e.g. a galaxy of stars) needs to override it with the star's own mass. */
	starMassKgOverride?: number
	/** Overrides STAR_IDENTITY.getStarAgeGyr's Sol-relative default.age. Only
	 * meant for GALAXY_SYSTEMS.generate, which ports galaxy-gen's real
	 * stochastic per-star age roll (rollStarAgeGyr in galaxy/systems/index.ts)
	 * -- the deterministic Sol-relative default stays exactly as-is for every
	 * other caller, since it exists specifically to keep a single-star
	 * system's forced Earth-clone main world reading as Sol-like. */
	starAgeGyrOverride?: number
	/** Skips per-system LANGUAGE.spawn and every body/moon name roll (returning
	 * "" for each name instead), and skips the surface-tide heating precompute
	 * (TIDAL_SCHEDULE.buildSurfaceTidesSeismologyCallbacks) -- for bulk
	 * pre-generation passes (e.g. a whole galaxy's worth of systems up front)
	 * where both are pure flavor/refinement that only matter once a system is
	 * actually opened. */
	skipNaming?: boolean
}
