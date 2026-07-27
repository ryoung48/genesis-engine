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

export const DEFAULT_SPECTRAL_CLASS: MainSequenceClass = "G"
export const DEFAULT_STAR_SUBTYPE = 2.0
export const DEFAULT_ORBITAL_DISTANCE_AU = 1.0

export interface StarSpectralInput {
	cls: MainSequenceClass
	subtype: number
}

export interface BlackbodyFractionInput {
	lambdaNm: number
	temperatureK: number
}

export interface LerpInput {
	start: number
	end: number
	position: number
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
