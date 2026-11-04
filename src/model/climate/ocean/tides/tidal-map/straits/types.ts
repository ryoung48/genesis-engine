import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface StraitDampingParams {
	mesh: Pick<
		SphereMesh,
		"numRegions" | "adjOffset" | "adjList" | "neighborDist"
	>
	isOcean: (region: number) => boolean
	landmarks: Pick<GenesisLandmarks, "regionLandmark" | "type">
	planetRadiusKm: number
}
