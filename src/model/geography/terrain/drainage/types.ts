import type { SphereMesh } from "@/model/mesh/types"

export interface DrainageOrderParams {
	mesh: Pick<SphereMesh, "numRegions" | "adjOffset" | "adjList">
	elevation: Float32Array
	isLand: Uint8Array
	sinks: Uint8Array
}

export interface DrainageOrder {
	drainTarget: Int32Array
	processOrder: Int32Array
	waterLevel: Float32Array
}
