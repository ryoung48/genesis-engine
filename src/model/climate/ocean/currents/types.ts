import type { SverdrupParams } from "@/model/climate/ocean/currents/sverdrup/types"
import type {
	GenesisClimate,
	GenesisOceanCurrents,
} from "@/model/climate/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"

export type ComputeCurrentsParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	distCoast: Float32Array
	landmarks: GenesisLandmarks
	monthlyTEQ: Float32Array[]
	climate: GenesisClimate
	elevation_km: Float32Array
	params: SverdrupParams
	// [JUSTIFICATION] Only diagnostics substituting real GODAS/NCEP wind for
	// comparison need this; omitting it keeps today's procedural-wind
	// behavior unchanged.
	observedWind?: {
		real_u_monthly?: Float32Array
		real_v_monthly?: Float32Array
	}
}

export type SmoothWarmthParams = {
	mesh: SphereMesh
	warmth: Float32Array
	isOcean: Uint8Array
}

export type ScaleFlowPairParams = {
	u: Float32Array
	v: Float32Array
}

export type FillEquatorialBandParams = {
	mesh: SphereMesh
	warmth: Float32Array
	latDeg: Float32Array
	isOcean: Uint8Array
}

export type ApplySSTToClimateParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	oceanCurrents: GenesisOceanCurrents
}

export type BuildOceanCurrentGridParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	oceanCurrents: GenesisOceanCurrents
	month: number
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
