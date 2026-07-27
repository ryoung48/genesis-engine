import type { SphereMesh } from "@/model/mesh/types"

export interface ComputeOceanDistanceBFSParams {
	mesh: SphereMesh
	isLand: Uint8Array
	planetRadiusKm: number
}

export interface ComputeCoastDistancesParams {
	mesh: SphereMesh
	isLand: Uint8Array
	planetRadiusKm?: number
}

export interface CountContinentsParams {
	mesh: SphereMesh
	isLand: Uint8Array
}
