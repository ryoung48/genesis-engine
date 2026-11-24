import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { SimSpace } from "@/model/geography/tectonics/sim-mesh/types"

export type WidthKind =
	| "andean"
	| "himalayan"
	| "foreland"
	| "ural"
	| "laramide"
	| "transpression"

export interface BeltWidthParams {
	kind: WidthKind
	workKm: number
	rateCmYr: number
}

export interface BeltShapeParams {
	headOn: number
	slabAgeMyr: number | null
}

export interface Belt {
	type: number
	time: number
	side: number
	widths: number[]
	works: number[]
	shears: number[]
	amps: number[]
}

export interface SpreadBeltParams {
	space: SimSpace
	crust: CrustRaster
	sources: number[]
	belt: Belt
	allow: (cell: number) => boolean
}

export interface BuildHeightsParams {
	crust: CrustRaster
	cell: number
	type: number
	side: number
	u: number
	reachKm: number
	workKm: number
	thickenedKm: number
	amp: number
}
