import type { SphereMesh } from "@/model/mesh/types"
export type CoastalBleedInput = {
	mesh: SphereMesh
	isLand: Uint8Array
	isLake: Uint8Array
	oceanValue: Float32Array
	avgEdgeKm: number
}
