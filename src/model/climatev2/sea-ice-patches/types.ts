import type { SphereMesh } from "@/model/mesh/types"

export interface SeaIcePatchParams {
	mesh: Pick<SphereMesh, "numRegions" | "adjOffset" | "adjList" | "regionArea">
	ocean: Uint8Array
	months: Uint8Array
	monthCount: number
}
