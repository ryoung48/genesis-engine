export type FlagPattern =
	| "identicon"
	| "organic-identicon"
	| "horizontal-bicolor"
	| "vertical-bicolor"
	| "horizontal-tricolor"
	| "vertical-tricolor"
	| "horizontal-stripes"
	| "vertical-stripes"
	| "diagonal-stripes"
	| "cross"
	| "nordic-cross"
	| "saltire"
	| "diagonal-striped-saltire"
	| "quarterly"
	| "chevron"
	| "bend"
	| "canton"
	| "lozenge"
	| "outlined-lozenge"
	| "pall"
	| "roundel"
	| "ring"
	| "three-roundels"
	| "three-rings"
	| "interlocked-rings"
	| "roundel-stripes"
	| "dots"
	| "crescent"
	| "sunburst"
	| "split-stripes-crosses"
	| "split-stripes-roundels"
	| "quartered-stripes-crosses"
	| "quartered-stripes-roundels"
	| "striped-roundel"
	| "vertical-striped-roundel"
	| "striped-cross"
	| "striped-crosses"
	| "quartered-patterns"
	| "nested-quarterly"
	| "double-chevron"
	| "chief"
	| "chief-rings"
	| "label"
	| "gyronny"
	| "cross-pattee"
	| "cross-engrailed"
	| "tomoe"
	| "rising-sun"
	| "trigram-bars"
	| "kente-bands"
	| "octagram"
	| "lotus"
	| "arabesque-band"
	| "inti-sun"

export interface FlagDesign {
	seed: string
	pattern: FlagPattern
	colors: readonly [string, string, string]
	stripeCount: number
	roundelRadius: number
	reversed: boolean
	hueDegrees: number | null
	quarters: readonly FlagDesign[]
}

export interface FlagDesignSampleParams extends FlagSampleParams {
	depth: number
	restricted: boolean
}

export interface PickPatternParams {
	roll: number
	pool: readonly FlagPattern[]
}

export interface FlagPaintParams {
	ctx: CanvasRenderingContext2D
	design: FlagDesign
	width: number
	height: number
}

export interface FlagStar extends FlagCircle {
	points: number
	innerRatio: number
}

export interface FlagCircle {
	x: number
	y: number
	radius: number
}

export type FlagHue =
	| "random"
	| "red"
	| "orange"
	| "yellow"
	| "green"
	| "teal"
	| "blue"
	| "purple"
	| "pink"

export interface FlagSampleParams {
	seed: string
	pattern: FlagPattern | "all" | "map"
	hue: number | null
}

export interface FlagRenderParams {
	design: FlagDesign
	width: number
}

export type FlagPoint = readonly [number, number]
