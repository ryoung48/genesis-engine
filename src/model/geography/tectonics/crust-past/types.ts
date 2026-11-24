import type { BentPieces } from "@/model/geography/tectonics/bent-pieces/types"
import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type {
	BeltPart,
	RangeEvent,
} from "@/model/geography/tectonics/range-shape/types"
import type { SimSpace } from "@/model/geography/tectonics/sim-mesh/types"

export interface ReplayPastParams {
	space: SimSpace
	crust: CrustRaster
	pieces: BentPieces
	seed: number
}

export interface PastEvent extends RangeEvent {
	outline: number[]
	strength: number
	allow: (cell: number) => boolean
	parts: BeltPart[]
	works: number[]
}

export interface PastRecord {
	events: PastEvent[]
	terraneAge: Map<number, number>
	seamKm: Float32Array
	cores: number
}

export interface PieceInfo {
	cells: number[]
	inland: number
	nbr: Set<number>
}

export interface PastContext {
	space: SimSpace
	crust: CrustRaster
	pieces: BentPieces
	seed: number
	land: Uint8Array
	toSea: Float64Array
	inFromEdge: Float64Array
	mass: Int32Array
	masses: number[][]
	terrane: Int32Array
	coreOf: Int32Array
	terraneAge: Map<number, number>
	events: PastEvent[]
	nextTerrane: number
	cores: number
}

export interface MassParams {
	ctx: PastContext
	cells: number[]
	index: number
}

export interface WearParams {
	crust: CrustRaster
	dtMyr: number
}
