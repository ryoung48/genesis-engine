import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisProvinces } from "@/model/types/society"

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
