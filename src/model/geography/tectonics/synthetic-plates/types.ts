import type { SphereMesh } from "@/model/mesh/types"

export interface DeriveSyntheticPlatesParams {
	mesh: SphereMesh
	elevation: Float32Array
}

export interface BuildSyntheticPlatesParams {
	plateIds: number[]
	plateIsOcean: Set<number>
}

export interface BuildDummyBoundaryParams {
	mesh: SphereMesh
	elevation: Float32Array
}

export interface ComputeSimpleDistanceFieldsParams {
	mesh: SphereMesh
	elevation: Float32Array
	planetRadiusKm?: number
}
