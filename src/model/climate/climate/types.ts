import type { GenesisClimate } from "@/model/types/climate"
import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisParams } from "@/model/types/tectonics"

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
