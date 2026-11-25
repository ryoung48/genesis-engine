import type { SphereMesh } from "@/model/mesh/types"

export type ShoreRelief = "none" | "low" | "sloping" | "steep"

export interface ShoreReliefParams {
	mesh: SphereMesh
	elevationKm: Float32Array
	isLand: Uint8Array
	openWater: Uint8Array
	coastal: Uint8Array
	planetRadiusKm: number
}

export interface ReliefClassParams {
	gradientMPerKm: number
}
