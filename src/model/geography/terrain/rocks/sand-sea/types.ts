import type { SphereMesh } from "@/model/mesh/types"

export interface SandSeaParams {
	mesh: SphereMesh
	planetRadiusKm: number
	isLand: Uint8Array
	koppen: Uint8Array
	elevationKm: Float32Array
}

export interface NeighbourAverageParams {
	mesh: SphereMesh
	field: Float32Array
	include: Uint8Array
	passes: number
}
