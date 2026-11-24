import type { SphereMesh } from "@/model/mesh/types"

export interface RiverSedimentParams {
	mesh: SphereMesh
	planetRadiusKm: number
	isLand: Uint8Array
	sedimentKm: Float32Array
	discharge: Float32Array
	elevationKm: Float32Array
}

export interface RiverSedimentMask {
	river: Float32Array
	plainLowKm: number
	plainHighKm: number
}

export interface PlainEdgesParams {
	sedimentKm: Float32Array
	isLand: Uint8Array
}
