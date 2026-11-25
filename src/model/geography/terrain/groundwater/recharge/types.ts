import type { RegionClimate } from "@/model/geography/terrain/groundwater/types"

export interface RechargeParams {
	keyCode: Uint8Array
	runoffMm: Float32Array
	infiltration: Float32Array
	slope: Float32Array
	climate: RegionClimate
	active: Uint8Array
	secondsPerYear: number
}

export interface RechargeLayer {
	logK: Float32Array
	dissolving: Float32Array
	rechargeMm: Float32Array
	rechargeMs: Float64Array
}

export interface RechargeFractionParams {
	runoffMm: number
	logK: number
	infiltration: number
	slope: number
	permafrost: number
}
