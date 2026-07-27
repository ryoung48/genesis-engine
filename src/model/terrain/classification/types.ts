import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisLandmarks } from "@/model/terrain/landmarks/types"
import type { GenesisRivers } from "@/model/terrain/rivers/types"

export interface ComputeSlopeScoreParams {
	mesh: SphereMesh
	elevationKm: Float32Array
	planetRadiusKm?: number
}

export interface ClassifyTopographyParams {
	mesh: SphereMesh
	elevationKm: Float32Array
	isLand: Uint8Array
	rivers: Pick<GenesisRivers, "visible" | "terminal">
	landmarks: Pick<GenesisLandmarks, "regionLandmark" | "type">
	vegetation?: Uint8Array
	slopeScore?: Float32Array
	planetRadiusKm?: number
	seed?: number
	tidalRange?: Float32Array
}
