import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { SimSpace } from "@/model/geography/tectonics/sim-mesh/types"
import type { SimplexNoise } from "@/model/shared/math/simplex-noise"
import type { Vec3 } from "@/model/shared/math/vec3/types"

export type Pair = readonly [number, number]

export type PastKind = "ring" | "sub" | "weld"

export type RangeStyleKey =
	| "spine"
	| "plateau"
	| "folds"
	| "blocks"
	| "sliver"
	| "knots"

export interface RangeSideSpec {
	type: string
	side: string
	share: number
}

export interface RangeStyleSpec {
	smoothMinKm: number
	smoothShare: number
	smooth: number
	segKm: Pair
	overlap: number
	echelonDeg: Pair
	offset: number
	gap: number
	bow: number
	strength: Pair
	massif: number
	segWidth: Pair
	tipWidth: number
	lensPow: number
	workPow: number
	tipAmp: number
	ampPow: number
	widthNoise: number
	widthNoiseKm: number
	ampNoise: number
	ampNoiseKm: number
	ampKnee: number
	ampMax: number
	width: Pair
	work: Pair
	amp: Pair
	// [JUSTIFICATION]: single-belt styles name one orogeny type; two-sided styles list `sides` instead.
	type?: string
	// [JUSTIFICATION]: only the spine and plateau styles write two sides of one suture.
	sides?: readonly RangeSideSpec[]
}

export interface BeltPart {
	type: number
	side: number
	front: number[]
	widths: number[]
	works: number[]
	amps: number[]
	shear: number
	allow: (cell: number) => boolean
}

export interface RangeEvent {
	kind: PastKind
	age: number
	front: number[]
	work: number
	// [JUSTIFICATION]: only a weld knows which of its two sides is the thrust-over one.
	upper?: (side: Int8Array) => number
}

export interface RangeOk {
	source: (cell: number) => boolean
	reach: (cell: number) => boolean
}

export interface ShapeRangeParams {
	space: SimSpace
	ev: RangeEvent
	ok: RangeOk
	widthKm: number
	seed: number
}

export interface ShapedRange {
	style: RangeStyleKey
	parts: BeltPart[]
	front: number[]
	works: number[]
}

export interface FrontChainsParams {
	space: SimSpace
	cells: number[]
	minKm: number
}

export interface Curve {
	pts: Vec3[]
	km: number
}

export interface SmoothCurveParams {
	space: SimSpace
	chain: number[]
	stepKm: number
	sigmaKm: number
}

export interface Segment {
	pts: Vec3[]
	t: number[]
	strength: number
	width: number
}

export interface RangeSegmentsParams {
	space: SimSpace
	curve: Curve
	style: RangeStyleSpec
	widthKm: number
	rng: () => number
}

export interface Wobble {
	noise: SimplexNoise
	wF: number
	aF: number
}

export interface RasterSource {
	w: number
	k: number
	a: number
	pt: Vec3
	seg: Segment
	i: number
}

export interface RasterizeParams {
	space: SimSpace
	segs: Segment[]
	style: RangeStyleSpec
	workKm: number
	ok: (cell: number) => boolean
	amp: number
	wobble: Wobble | null
}

export interface Raster {
	front: number[]
	widths: number[]
	works: number[]
	amps: number[]
	at: Map<number, RasterSource>
}

export interface SidesOfParams {
	space: SimSpace
	raster: Raster
	ok: (cell: number) => boolean
	reachKm: number
}

export interface BeltSnapshot {
	[field: string]: Float32Array | Uint8Array | Int8Array
}

export interface MaskBeltParams {
	space: SimSpace
	crust: CrustRaster
	was: BeltSnapshot
	seed: number
}

export interface StyleForParams {
	ev: RangeEvent
	rng: () => number
}

export interface MaskAtParams {
	noise: SimplexNoise
	p: Vec3
	f: number
	fw: number
	aw: number
	octaves: number
}
