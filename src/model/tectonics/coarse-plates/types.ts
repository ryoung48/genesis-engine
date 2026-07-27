import type { SphereMesh } from "@/model/mesh/types"
import type { PlateVec } from "@/model/tectonics/types"

interface CoarsePlateOptions {
	coarsePoints?: number
}

export interface CoarsePlateResult {
	coarseMesh: SphereMesh
	coarse_r_plate: Int32Array
	coarsePlateSeeds: Set<number>
	coarsePlateVec: Map<number, PlateVec>
	coarsePlateIsOcean: Set<number>
}

export interface ProjectCoarsePlatesParams {
	mesh: SphereMesh
	coarseMesh: SphereMesh
	coarse_r_plate: Int32Array
	seed: number
	numPlates: number
}

export interface GenerateCoarsePlatesParams {
	seed: number
	numPlates: number
	landDistribution: number
	continentSizeVariety: number
	landCoverage: number
	options?: CoarsePlateOptions
}
