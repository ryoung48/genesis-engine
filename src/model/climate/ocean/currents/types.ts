import type { GenesisOceanCurrents } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"

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
