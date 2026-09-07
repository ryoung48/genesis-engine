import type {
	GenesisClimate,
	GenesisOceanCurrents,
} from "@/model/climate/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"

export type ComputeSSTParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	distCoast: Float32Array
	landmarks: GenesisLandmarks
	monthlyTEQ: Float32Array[]
	/** RAIN.computeAdvection's per-region east/west moisture-advection split
	 * -- which channel dominates a coastal cell (trade winds vs westerlies)
	 * determines its current facing, not a separate geographic bearing. */
	eastAdv: Float32Array
	westAdv: Float32Array
	planetRadiusKm?: number
}

export type ApplySSTToClimateParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	oceanCurrents: GenesisOceanCurrents
}

export type BuildOceanCurrentGridParams = {
	mesh: SphereMesh
	sst: Float32Array
	isLand: Uint8Array
	latDeg: Float32Array
	lonDeg: Float32Array
	reverseCirculation?: boolean
	planetRadiusKm?: number
}

export type ObservedOceanCurrentGridParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	observedCurrent:
		| {
				real_u_monthly?: Float32Array
				real_v_monthly?: Float32Array
				real_sst_anomaly_monthly?: Float32Array
		  }
		| undefined
	month?: number
}
