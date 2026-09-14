import type {
	AtmosphereProfile,
	OrbitBody,
} from "@/model/celestial/orbit-body/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type MoonOrbitRange = "inner" | "middle" | "outer" | "extreme"
type ParentOrbitGroup =
	| "asteroid belt"
	| "dwarf"
	| "terrestrial"
	| "helian"
	| "jovian"

export interface MoonBody extends OrbitBody {
	meanAnomalyAtEpochDeg: number
	/** Unset on partial/authored moon records before orbital placement assigns
	 * an inner/middle/outer band. */
	orbitRange?: MoonOrbitRange
	/** Unset alongside orbitRange before orbital placement calculates the
	 * parent-diameter distance. */
	semiMajorAxisPlanetDiameters?: number
	/** Set when the "gas-giant-moon" main-world mode promotes this moon to be
	 * the player's home world instead of a top-level SystemBody -- see
	 * generateSystemBodies' gas-giant-moon branch. Absent/false for every
	 * ordinary moon. */
	isMainWorld?: boolean
}

interface MoonRngInput {
	rng: SharedRng
}
export interface RollDieInput extends MoonRngInput {
	sides: number
}
export interface RollMoonSizeClassInput extends MoonRngInput {
	parentSizeClass: number
	parentGroup: ParentOrbitGroup
}
export interface RollMoonDiameterInput extends MoonRngInput {
	sizeClass: number
}
export interface RollMoonOrbitCandidateInput extends MoonRngInput {
	morPd: number
}
export interface PendingMoon {
	massKg: number
	diameterKm: number
	sizeClass: number
	moonMinimumPd: number
	orbitRange: MoonOrbitRange
	rolledPd: number
	radiusPd: number
}
export interface PlaceMoonOrbitsInput {
	moons: PendingMoon[]
	morPd: number
	maxStablePd: number
	minimumSpacingPd: number
}
export interface AttachParentTideLocksInput {
	moons: MoonBody[]
	parentIdx: number
}
export interface RollMoonCountInput extends MoonRngInput {
	parentGroup: ParentOrbitGroup
	parentSizeClass: number
	orbitalDistanceAU: number
	/** Book's Significant Moon Quantity DM-1-per-die (p. 54): true when any of
	 * "adjacent to a companion," "adjacent to a Close/Near star unavailability
	 * range," or "adjacent to the outermost range of a Close/Near/Far star"
	 * applies -- collapsed into one flag since the book applies only one DM
	 * regardless of how many of its conditions hold. [JUSTIFICATION] Only a
	 * multi-star caller has a companion to be adjacent to; every single-star
	 * caller omits this (equivalent to false). */
	nearCompanionExclusion?: boolean
}
export interface RollMoonEccentricityInput extends MoonRngInput {
	range: MoonOrbitRange
	sizeClass: number
}
export interface GenerateMoonsInput {
	count: number
	seed: number
	planetRadiusKm: number
	parentSizeClass: number
	orbitalDistanceAU: number
	starMassKg: number /** Defaults to terrestrial when omitted for ordinary rocky parents. */
	parentGroup?: ParentOrbitGroup
	/** The parent planet's own luminositySol/starAgeGyr -- a moon uses the
	 * exact same book Terrestrial Composition/Density roll (ROLLS.
	 * pickDensityEarthRelative) as any other rocky body, keyed off its own
	 * size and its parent's position relative to HZCO, not a separate
	 * ad hoc density range. */
	luminositySol: number
	starAgeGyr: number
}

// Fallback for any moon that doesn't get a rolled/authored atmosphere of its
// own (see generateMoons() and sol-system.ts's SolMoonSeed table) -- most
// moons in reality are airless, and an explicit vacuum profile keeps the
// stats card's Atmosphere row from silently disappearing (the row is only
// omitted when `atmosphere` is `undefined`, not when it's vacuum).
export const DEFAULT_MOON_ATMOSPHERE: AtmosphereProfile = {
	code: 0,
	pressureBar: 0,
	type: "vacuum",
	breathable: false,
}
