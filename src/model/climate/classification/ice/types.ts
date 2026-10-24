import type { GenesisClimate, GenesisRainfall } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface IceResult {
	/** Final steady-state ice thickness per cell (mm w.e.) */
	iceThickness: Float32Array
	/** Minimum ice level across the 12 months of the final year (mm w.e.) */
	iceMinMonthly: Float32Array
	/** Maximum ice level across the 12 months of the final year (mm w.e.) */
	iceMaxMonthly: Float32Array
}

export interface CoastBoostParams {
	mesh: SphereMesh
	isLand: Uint8Array
	distCoast: Float32Array
	// [JUSTIFICATION] Mirrors ComputeIceAccumulationParams, whose callers may omit the radius.
	planetRadiusKm?: number
}

export interface SeaIceCellYearParams {
	temperatureMonthly: Float32Array
	N: number
	r: number
	coastBoost: number
	cycles: number
	monthlyOut: Float32Array | null
}

export interface SeaIceCellYear {
	current: number
	min: number
	max: number
}

export interface ComputeSeaIceMonthlyParams {
	mesh: SphereMesh
	temperatureMonthly: Float32Array
	isLand: Uint8Array
	distCoast: Float32Array
	cycles: number
	planetRadiusKm: number
}

export type ComputeIceAccumulationParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	rainfall: GenesisRainfall
	isLand: Uint8Array
	distCoast: Float32Array
	cycles?: number
	planetRadiusKm?: number
}
