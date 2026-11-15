import type { SharedRng } from "@/model/shared/random/rng"
import type { CarvingFamily } from "@/model/society/script/runegen/carving/types"
import type { Point2D } from "@/model/society/script/runegen/point2d"

export type RuneTemplate =
	| "random1"
	| "random2"
	| "random4"
	| "random5"
	| "cursive"
	| "carved"

export type RuneMotif = "headline" | "baseline" | "stave" | "none"

export type RuneGeneratorOptions = {
	symmetryBias?: "symmetric" | "asymmetric" | "none"
	weightBand?: "light" | "medium" | "heavy" | "any"
	seedTemplate?: RuneTemplate | "any"
	forceTemplate?: RuneTemplate
	motif?: RuneMotif
	maxDots?: number
	allowDiscontinuousStrokes?: boolean
}

export type TemplateSpec = {
	width: number
	height: number
	// The 'any' weight band; named bands are scaled from the classic grid
	minWeight: number
	maxWeight: number
}

// Plain data describing a generated rune. RUNE.generate builds one of these
// by mutating a fresh instance across retry attempts, then returns it; every
// other RUNE function reads or derives a new instance from an existing one.
export type RuneData = {
	bitmap: boolean[][]
	strokes: Point2D[][]
	width: number
	height: number
	dotx: number
	doty: number
	dots: Point2D[]
	hSym: boolean
	vSym: boolean
	// [JUSTIFICATION] Unset until the first generation attempt picks a
	// template; every returned RuneData has it set.
	template?: RuneTemplate
	// [JUSTIFICATION] Only carved runes use family-specific contours.
	carvingFamily?: CarvingFamily
	maxDots: number
	allowDiscontinuousStrokes: boolean
	rng: SharedRng
	seed: string
}

export type GenerateRuneParams = {
	options?: RuneGeneratorOptions
	rng?: SharedRng
	seed?: string
	// [JUSTIFICATION] A carved alphabet assigns families across its letters. A standalone rune picks its own.
	carvingFamily?: CarvingFamily
}

export type DiffRunesParams = {
	a: RuneData
	b: RuneData
}

export type CountInkBlobsParams = {
	rune: RuneData
	size: number
}

export type PlaceRuneDotsParams = {
	rune: RuneData
	spots: Point2D[]
	budget: number
	// [JUSTIFICATION] Only letters with a mirrored outline need paired dots.
	mirrored?: boolean
}
