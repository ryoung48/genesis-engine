import type { GenesisClimate } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export interface LatBandInterpolationParams {
	range: number[]
	latDeg: number
}

export type ComputeSunlightParams = {
	mesh: SphereMesh
	params: GenesisParams
}

export interface Sunlight {
	daylight_hours_monthly: Float32Array
	insolation_monthly: Float32Array
	declination_monthly: Float32Array
}

export type ApplyDtrToClimateMinMaxParams = {
	climate: GenesisClimate
	dtr_monthly: Float32Array
	N: number
}
