import type { SphereMesh } from "@/model/mesh/types"

export interface CarryParams {
	mesh: SphereMesh
	planetRadiusKm: number
	isLand: Uint8Array
	drainTarget: Int32Array
	processOrder: Int32Array
	source: Float32Array
	lengthKm: number
}

export interface PlacerFactorParams {
	discharge: number
	rough: number
	glaciated: boolean
	till: boolean
}
