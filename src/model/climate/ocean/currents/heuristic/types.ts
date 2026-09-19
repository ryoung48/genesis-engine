import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"

export type HeuristicCurrentParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	distCoast: Float32Array
	landmarks: GenesisLandmarks
	monthlyTEQ: Float32Array[]
	eastAdv: Float32Array
	westAdv: Float32Array
	planetRadiusKm: number
}

export type CoastSideParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	isLake: Uint8Array
	isContinent: Uint8Array
	eastAdv: Float32Array
	westAdv: Float32Array
	avgEdgeKm: number
}
