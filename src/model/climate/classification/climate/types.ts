import type { GenesisClimate } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export interface MeshLatitudeGeometry {
	latDegByRegion: Float64Array
	latBandByRegion: Uint8Array
}

export type ComputeLandFractionParams = {
	mesh: SphereMesh
	isLand: Uint8Array
}

export type ComputeMonthlyDaylightHoursParams = {
	mesh: SphereMesh
	params: GenesisParams
}

export type ApplyDtrToClimateMinMaxParams = {
	climate: GenesisClimate
	dtr_monthly: Float32Array
	N: number
}

export type ComputeTemperatureParams = {
	mesh: SphereMesh
	elevation: Float32Array
	landFraction: number[]
	params: GenesisParams
	oceanDist?: Float32Array
	isLand?: Uint8Array
	elevation_km?: Float32Array
}
