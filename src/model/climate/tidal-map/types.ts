import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisParams } from "@/model/types/tectonics"
import type { GenesisLandmarks } from "@/model/terrain/landmarks"
import type { TidalSchedule } from "@/model/climate/tidal-schedule/types"

export interface ComputeSpringTideMapInput {
	mesh: SphereMesh
	isLand: Uint8Array
	isCoastal: Uint8Array
	schedule: TidalSchedule
	params: Pick<GenesisParams, "seed" | "planetRadiusKm">
	/** Landmarks are absent when terrain landmark generation is disabled. */
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">
}
