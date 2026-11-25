import type { SphereMesh } from "@/model/mesh/types"

export interface LocalSlopeParams {
	mesh: Pick<
		SphereMesh,
		"numRegions" | "adjOffset" | "adjList" | "neighborDist"
	>
	elevationKm: Float32Array
	planetRadiusKm: number
}
