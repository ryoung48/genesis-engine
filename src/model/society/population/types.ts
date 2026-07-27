import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface BfsUpdateMinHopsParams {
	start: number
	adjOffset: Int32Array
	adjList: Int32Array
	minHops: Int32Array
}

export interface ComputeMigrationParams {
	provinces: GenesisProvinces
	habitability: Float32Array
	mesh: SphereMesh
	planetRadiusKm?: number
	numRegions?: number
}
