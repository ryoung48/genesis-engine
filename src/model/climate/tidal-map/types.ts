import type { TidalSchedule } from "@/model/climate/tidal-schedule/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export interface ComputeSpringTideMapInput {
	mesh: SphereMesh
	isLand: Uint8Array
	isCoastal: Uint8Array
	schedule: TidalSchedule
	params: Pick<GenesisParams, "seed" | "planetRadiusKm">
	/** Landmarks are absent when terrain landmark generation is disabled. */
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">
}
