import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { PlateMotion } from "@/model/geography/tectonics/plate-motion/types"
import type { SimSpace } from "@/model/geography/tectonics/sim-mesh/types"
import type { SimFront } from "@/model/geography/tectonics/world-sample/types"

export interface BuildBentPiecesParams {
	space: SimSpace
	crust: CrustRaster
	motion: PlateMotion
	simFronts: SimFront[]
	seed: number
}

export interface BentPieces {
	tp: Int32Array
	wp: Int32Array
	sub: Int32Array
	dragKm: Float32Array
}

export interface Push {
	v: [number, number, number]
	km: number
}

export interface DragParams {
	params: BuildBentPiecesParams
	isLand: Uint8Array
}

export interface DragResult {
	D: Float32Array
}

export interface PieceTerranesParams {
	params: BuildBentPiecesParams
	wp: Int32Array
	bent: Float32Array
}
