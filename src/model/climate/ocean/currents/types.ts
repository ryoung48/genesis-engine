import type {
	GenesisClimate,
	GenesisOceanCurrents,
} from "@/model/climate/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
export type RotatingSSTParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	distCoast: Float32Array
	landmarks: GenesisLandmarks
	monthlyTEQ: Float32Array[]
	eastAdv: Float32Array
	westAdv: Float32Array
	planetRadiusKm: number
}
export type ComputeSSTParams = Omit<RotatingSSTParams, "planetRadiusKm"> & {
	params: GenesisParams
}
export type ApplySSTToClimateParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	oceanCurrents: GenesisOceanCurrents
	isLocked: boolean
}
export type CoastSideInput = {
	mesh: SphereMesh
	isLand: Uint8Array
	isLake: Uint8Array
	landmarks: ComputeSSTParams["landmarks"]
	eastAdv: Float32Array
	westAdv: Float32Array
	avgEdgeKm: number
}
export type BandInput = { dist: number; coastSide: number }
