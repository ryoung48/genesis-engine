import type { RegionClimate } from "@/model/geography/terrain/groundwater/types"

export interface HydraulicSoilParams {
	keyCode: Uint8Array
	glaciated: Uint8Array
	slope: Float32Array
	climate: RegionClimate
	active: Uint8Array
}

export interface HydraulicSoilLayer {
	sand: Float32Array
	clay: Float32Array
	depthM: Float32Array
	ksMs: Float64Array
	infiltration: Float32Array
	awcMm: Float32Array
}

export interface SoilTextureParams {
	base: readonly [number, number, number]
	rain: number
	mean: number
	wetIndex: number
}

export interface SoilDepthParams {
	mass: number
	rate: number
	rain: number
	coldest: number
	warmest: number
	slope: number
	halved: boolean
	young: boolean
}
