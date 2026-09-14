import type { SharedRng } from "@/model/shared/random/rng"
export const MAIN_SEQUENCE_CLASSES = [
	"O",
	"B",
	"A",
	"F",
	"G",
	"K",
	"M",
] as const
export type MainSequenceClass = (typeof MAIN_SEQUENCE_CLASSES)[number]

// Sub-stellar/degenerate/compact classes galaxy-gen also models -- ported
// alongside MAIN_SEQUENCE_CLASSES rather than merged into it, since every
// existing STAR.getStarXxx caller that only ever dealt with real main-
// sequence dwarfs stays valid (MainSequenceClass remains a strict subset of
// SpectralClass). See STAR.rollStarAttributes for how these actually get
// rolled (brown-dwarf-tail / white-dwarf-parent / 5% exotic-root branches).
export const EXOTIC_SPECTRAL_CLASSES = ["L", "T", "Y", "D", "NS", "BH"] as const
export type ExoticSpectralClass = (typeof EXOTIC_SPECTRAL_CLASSES)[number]
export type SpectralClass = MainSequenceClass | ExoticSpectralClass

// "V" (ordinary main-sequence dwarf) is what every star rolled before this
// port implicitly was -- these add giant/subgiant/subdwarf/supergiant phases
// for O-M stars. Neutron stars use O/P/M as their second classification:
// ordinary, pulsar, or magnetar.
export const STANDARD_LUMINOSITY_CLASSES = [
	"Ia",
	"Ib",
	"II",
	"III",
	"IV",
	"V",
	"VI",
] as const
export type StandardLuminosityClass =
	(typeof STANDARD_LUMINOSITY_CLASSES)[number]
export type NeutronStarLuminosityClass = "O" | "P" | "M"
export type LuminosityClass =
	| StandardLuminosityClass
	| NeutronStarLuminosityClass

export const DEFAULT_SPECTRAL_CLASS: MainSequenceClass = "G"
export const DEFAULT_LUMINOSITY_CLASS: StandardLuminosityClass = "V"
export const DEFAULT_STAR_SUBTYPE = 2.0
export const DEFAULT_ORBITAL_DISTANCE_AU = 1.0

// Deliberately NOT widened to SpectralClass -- every STAR.getStarXxx caller
// using this type only ever deals with ordinary V-class O-M dwarfs (see
// FULL_SPECTRAL_RANGES/rollStarAttributes in index.ts for the separate,
// parallel model that actually covers the rest of SpectralClass).
export interface StarSpectralInput {
	cls: MainSequenceClass
	subtype: number
}

/** Every physical quantity STAR.rollStarAttributes rolls for one star --
 * mirrors galaxy-gen's StarAttributes (stars/types.ts) field-for-field,
 * renamed to this repo's *Sol/*K/*Gyr suffix convention. */
export interface RolledStarAttributes {
	spectralClass: SpectralClass
	luminosityClass: LuminosityClass
	subtype: number
	massSol: number
	temperatureK: number
	diameterSol: number
	luminositySol: number
	ageGyr: number
	mao: number
	hzco: number
}

/** Physical host attributes needed by planetary generation. `hzco` remains a
 * star-catalog/rendering value and is not consumed by that pipeline. */
export type HostStarAttributes = Omit<RolledStarAttributes, "hzco">

/** Mirrors galaxy-gen's ParentStarLike (stars/generation.ts) -- the subset of
 * a rolled star's own attributes a companion roll needs to know about its
 * parent (spectral/luminosity class for the Non-Primary Star Determination
 * table's method roll and exotic-class inheritance, age to copy directly,
 * mass for post-stellar mass derivation). */
export interface ParentStarLike {
	spectralClass: SpectralClass
	luminosityClass: LuminosityClass
	subtype: number
	massSol: number
	ageGyr: number
}

/** Which column of the Non-Primary Star Determination table a companion
 * roll uses -- "secondary" for a companion of the system's root primary
 * (Close/Near/Far in the source text; this codebase's inner/outer/distant
 * StarRoles), "companion" for a companion of a companion (this codebase's
 * epistellar StarRole). Post-stellar parents (white dwarf/neutron
 * star/black hole) use neither -- STAR.rollStarAttributes switches to the
 * table's Post-Stellar column internally whenever the parent is one of
 * those, regardless of which column is passed in. */
export type NonPrimaryStarColumn = "secondary" | "companion"

/** One row's resolved method from the Non-Primary Star Determination table.
 * "exotic" carries the Other-column direct-result case (D* / D / BD) rather
 * than a further transform -- see STAR.rollStarAttributes' method-roll
 * doc comment for the full table and the Other-column swap/resolve rule. */
export type NonPrimaryStarMethod =
	| "random"
	| "lesser"
	| "sibling"
	| "twin"
	| { exotic: "D*" | "D" | "BD" }

export interface BlackbodyFractionInput {
	lambdaNm: number
	temperatureK: number
}

export interface InterpolateSeriesInput {
	position: number
	values: number[]
}

export interface KeplerYearInput {
	orbitalDistanceAU: number
	massSol: number
}

export interface RollStarAgeInput {
	rng: Pick<SharedRng, "randint" | "uniform">
	massSol: number
}

export interface StarProtoInput {
	ageGyr: number
	massSol: number
}

export interface StarPrimordialInput {
	ageGyr: number
}
