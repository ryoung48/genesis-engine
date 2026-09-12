import type { SverdrupParams } from "@/model/climate/ocean/currents/sverdrup/types"
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
	eastAdv: Float32Array
	westAdv: Float32Array
	climate: GenesisClimate
	elevation_km: Float32Array
	params: SverdrupParams
	onWindProfile: (durationMs: number) => void
}

export type ComputeCoastSideParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	isLake: Uint8Array
	isContinent: Uint8Array
	eastAdv: Float32Array
	westAdv: Float32Array
	avgEdgeKm: number
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
