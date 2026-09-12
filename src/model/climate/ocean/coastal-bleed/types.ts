import type { SphereMesh } from "@/model/mesh/types"

export type BleedOntoLandParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	isLake: Uint8Array
	oceanValue: Float32Array
	avgEdgeKm: number
}

export type FillLandParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	isLake: Uint8Array
	avgEdgeKm: number
	sst: Float32Array
	sstMonthly: Float32Array
}
