import type {
	HostStarAttributes,
	LuminosityClass,
	SpectralClass,
} from "@/model/celestial/star/types"
import type { SystemBody } from "@/model/celestial/system/types"

export interface GalaxySystemSeedParams {
	galaxySeed: number
	systemIndex: number
}

export interface GalaxyStarSeedParams extends GalaxySystemSeedParams {
	starIndex: number
}

export interface GalaxySystemParams {
	galaxySeed: number
	systemIndex: number
	/** Index of the nation that owns this system (Galaxy.nationAssignment),
	 * or -1/undefined for an unclaimed system. When set, the system's stars
	 * are named from that nation's language (see
	 * GALAXY_IDENTITY.generateSystemStarName) so a realm's worlds share a
	 * naming style; otherwise they fall back to the per-system language. */
	nationIndex?: number
	/** Skips star names and every body/moon name (see generateSystemBodies'
	 * own skipNaming) -- for bulk pre-generation of a whole galaxy's systems,
	 * where naming's LANGUAGE.spawn cost is wasted until a system is opened. */
	skipNaming?: boolean
	/** [JUSTIFICATION] Only the galaxy pregen worker and the galaxy view's
	 * open-system handlers know the capital set (Galaxy.nationSeeds); the
	 * single-system editor has no galaxy/capitals. When true, this system's
	 * PRIMARY star reserves a guaranteed procedural temperate homeworld
	 * (MainWorldMode "temperate-native"). */
	isCapital?: boolean
}

/** How a star relates to the star it orbits, mirroring galaxy-gen's
 * companion-star zones (rollStarCompanionTemplates) -- "primary" is the
 * system's root star (no parent). A star with a parent can itself gain one
 * more "epistellar" companion of its own; only the top-level primary can
 * gain "inner"/"outer"/"distant" companions (each of which can, in turn,
 * gain one more "epistellar" companion) -- see GALAXY_SYSTEMS.rollStarTree. */
export type StarRole = "primary" | "epistellar" | "inner" | "outer" | "distant"

/** One star in a system's cheap rendering-only preview (see
 * GALAXY_SYSTEMS.previewStars) -- the same roll tree `generate` below walks
 * to build real per-star planetary systems, just stopped short of paying
 * for body generation. */
export interface StarPreview extends HostStarAttributes {
	/** Widened from MainSequenceClass -- STAR.rollStarAttributes can roll any
	 * of the exotic classes too (brown dwarf L/T/Y, white dwarf D, neutron
	 * star NS, black hole BH), not just O-M dwarfs. */
	spectralClass: SpectralClass
	/** Defaults to "V" for an ordinary dwarf; giants/subgiants/subdwarfs/
	 * supergiants only ever occur for a rolled O-M spectralClass (every
	 * exotic class forces this back to "V" -- see STAR.rollStarAttributes). */
	luminosityClass: LuminosityClass
	role: StarRole
	/** Index into the same preview/star array this entry came from, or null
	 * for the primary. */
	parentIndex: number | null
	/** Rolled once for the primary (STAR.rollStarAttributes' age branch,
	 * ported from galaxy-gen's rollStarAttributes) and inherited unchanged by
	 * every companion -- see rollStarTree, which mirrors the source's
	 * `age = parent?.age ?? 0` rule. */
	/** Minimum allowable orbit (AU) -- galaxy-gen's "dust-clearing" distance a
	 * planet can't form inside of. Fixed constants for brown dwarfs (0.005)
	 * and degenerate/compact objects (0.001) rather than interpolated -- see
	 * STAR.rollStarAttributes. */
	/** Distance from the star it orbits, as a habitable-zone deviation (same
	 * units PLANET.deviationToAU takes) -- 0 for the primary. Rolled once per
	 * companion from a continuous range specific to its role (see
	 * GALAXY_SYSTEMS.rollStarTree's ROLE_DEVIATION_RANGE), independently of
	 * the discrete deviation pool its parent's own planets sample from -- a
	 * shared pool would let a companion land on the exact same deviation (and
	 * therefore the exact same orbitalDistanceAU) as one of its parent's real
	 * planets. */
	deviation: number
	/** Orbital eccentricity around the parent star; 0 for the primary. */
	eccentricity: number
	/** Orbital inclination around the parent star; 0 for the primary. */
	inclinationDeg: number
}

/** One real star in a system, with its own fully generated planets/moons --
 * every star in a multi-star system (not just the primary) gets a genuine
 * independent planetary system via SYSTEM_GENERATION, per
 * plans/galaxy-view-port.md's "no corners cut" multi-star requirement. */
export interface GalaxyStar extends HostStarAttributes {
	index: number
	parentIndex: number | null
	role: StarRole
	seed: number
	starName: string
	/** Widened from MainSequenceClass -- see StarPreview's doc. A UI showing
	 * this should be ready to render "D"/"NS"/"BH"/"L"/"T"/"Y", not just
	 * O-M. */
	bodies: SystemBody[]
	/** Distance from the star it orbits (its parent's own habitable-zone
	 * deviation-to-AU mapping, same as any planet uses) -- 0 for the
	 * primary, which has no parent to orbit. */
	orbitalDistanceAU: number
	/** Kepler period around its parent, using the parent's mass -- 0 for the
	 * primary. */
	orbitalPeriodDays: number
	/** Orbital eccentricity around the parent star; 0 for the primary. */
	eccentricity: number
	/** Orbital inclination around the parent star; 0 for the primary. */
	inclinationDeg: number
}

export interface GalaxySystem {
	systemIndex: number
	/** The system-level seed the star tree itself was rolled from -- each
	 * individual star has its own distinct seed (GalaxyStar.seed) for its
	 * planets/moons. */
	seed: number
	/** stars[0] is always the primary. */
	stars: GalaxyStar[]
}

/** Growable columnar accumulator for GALAXY_SYSTEMS.appendPackedSystemStarData
 * -- mirrors galaxy-gen's MutablePackedSystemStarData (createMutable.../
 * appendPackedSystemStarDataFromDice in stars/generation.ts), one array per
 * field instead of typed arrays since the final counts aren't known until
 * every system in the galaxy has been walked. */
export interface MutablePackedGalaxyStarData {
	parent: number[]
	role: number[]
	spectralClass: number[]
	luminosityClass: number[]
	subtype: number[]
	deviation: number[]
	eccentricity: number[]
	inclinationDeg: number[]
	age: number[]
	mass: number[]
	diameter: number[]
	temperature: number[]
	luminosity: number[]
	mao: number[]
}

/** Flat, transfer-cheap encoding of every star in every system of a galaxy --
 * mirrors galaxy-gen's ScaledGalaxy star* fields (systemStarOffset CSR + one
 * typed array per field). Now that exotic classes exist (white dwarf/neutron
 * star/black hole masses are multi-step RNG rolls, not a pure function of
 * spectralClass+subtype -- see STAR.rollStarAttributes), mass/diameter/
 * temperature/luminosity/mao are genuinely rolled outputs and have to be
 * packed too, same as galaxy-gen does -- they're no longer cheap derived
 * values the way they were back when every star was an ordinary V-class
 * dwarf. hzco is the galaxy-gen field NOT ported here: it is an
 * AU-to-render-units value with no equivalent renderer in this repo. */
export interface PackedGalaxyStars {
	/** CSR row offsets into the flat star arrays below, length numSystems+1. */
	systemStarOffset: Int32Array
	/** Local (per-system) parent star index, -1 for a system's primary. */
	starParent: Int32Array
	/** Encoded StarRole per star. */
	starRole: Uint8Array
	/** Encoded SpectralClass per star. */
	starSpectralClass: Uint8Array
	/** Encoded LuminosityClass per star. */
	starLuminosityClass: Uint8Array
	/** Continuous 0-10 spectral subtype per star (see DEFAULT_STAR_SUBTYPE) --
	 * kept as Float32 (not Uint8 like galaxy-gen's integer-subtype encoding)
	 * since this repo rolls a continuous subtype, not a single digit. */
	starSubtype: Float32Array
	/** Companion orbit deviation per star; 0 for a system's primary. */
	starDeviation: Float32Array
	/** Companion orbit eccentricity; 0 for a system's primary. */
	starEccentricity: Float32Array
	/** Companion orbit inclination in degrees; 0 for a system's primary. */
	starInclinationDeg: Float32Array
	/** Rolled star age in Gyr -- shared by every star in a companion tree
	 * (see StarPreview.ageGyr's doc). */
	starAge: Float32Array
	starMass: Float32Array
	starDiameter: Float32Array
	starTemperature: Float32Array
	starLuminosity: Float32Array
	starMao: Float32Array
}

/** One system's window into a galaxy-wide PackedGalaxyStars -- mirrors
 * galaxy-gen's PackedSystemStarSlice (stars/types.ts) shape. */
export interface PackedSystemStarSlice {
	start: number
	end: number
	parent: Int32Array
	role: Uint8Array
	spectralClass: Uint8Array
	luminosityClass: Uint8Array
	subtype: Float32Array
	deviation: Float32Array
	eccentricity: Float32Array
	inclinationDeg: Float32Array
	age: Float32Array
	mass: Float32Array
	diameter: Float32Array
	temperature: Float32Array
	luminosity: Float32Array
	mao: Float32Array
}
