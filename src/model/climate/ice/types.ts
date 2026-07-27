import type { GenesisClimate, GenesisRainfall } from "@/model/types/climate"
import type { SphereMesh } from "@/model/types/mesh"

export interface IceResult {
	/** Final steady-state ice thickness per cell (mm w.e.) */
	iceThickness: Float32Array
	/** Minimum ice level across the 12 months of the final year (mm w.e.) */
	iceMinMonthly: Float32Array
	/** Maximum ice level across the 12 months of the final year (mm w.e.) */
	iceMaxMonthly: Float32Array
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
