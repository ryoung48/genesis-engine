import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface ComputeSlopeScoreParams {
	mesh: SphereMesh
	elevationKm: Float32Array
	planetRadiusKm?: number
}

export interface ClassifyTopographyParams {
	mesh: SphereMesh
	elevationKm: Float32Array
	isLand: Uint8Array
	landmarks: Pick<GenesisLandmarks, "regionLandmark" | "type">
	slopeScore?: Float32Array
	planetRadiusKm?: number
}

export interface ApplyMarshParams {
	topography: Uint8Array
	wetlandShare: Float32Array
}

export interface IsSaltFlatParams {
	code: number
	lakeKind: number | undefined
}
