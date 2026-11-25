import type { OceanWaveField } from "@/model/climate/ocean/waves/types"
import type { GenesisWindMonthly } from "@/model/climate/weather/wind/types"
import type { SphereMesh } from "@/model/mesh/types"

export type ShoreExposureClass = "sheltered" | "moderate" | "exposed"

export interface ShoreExposureParams {
	mesh: SphereMesh
	isLand: Uint8Array
	openWater: Uint8Array
	windMonthly: GenesisWindMonthly
	temperatureMonthly: Float32Array
	iceMinMonthly: Float32Array
	iceMaxMonthly: Float32Array
	planetRadiusKm: number
}

export interface ShoreExposure {
	exposureOpenM: Float32Array
	exposureLeeM: Float32Array
}

export interface SeaExposureParams {
	field: OceanWaveField
	sea: number
	numRegions: number
	windMonthly: GenesisWindMonthly
	temperatureMonthly: Float32Array
	iceMinMonthly: Float32Array
	iceMaxMonthly: Float32Array
}

export interface EffectiveFetchParams {
	field: OceanWaveField
	sea: number
	windU: number
	windV: number
}

export interface ExposureClassParams {
	exposureM: number
}

export interface ShelterParams {
	exposureLeeM: Float32Array
}
