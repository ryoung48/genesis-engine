import type { PlateVec } from "@/model/types/tectonics"
import type { SphereMesh } from "@/model/types/mesh"

export interface GeneratePlatesResult {
	r_plate: Int32Array
	plateSeeds: Set<number>
	plateVec: Map<number, PlateVec>
}

export interface GeneratePlatesParams {
	mesh: SphereMesh
	numPlates: number
	seed: number
}

export interface AssignOceanLandParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateSeeds: Set<number>
	seed: number
	landDistribution: number
	continentSizeVariety?: number
	landCoverage?: number
}

export interface SmoothAndReconnectPlatesParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateSeeds: number[]
	numPasses: number
}
