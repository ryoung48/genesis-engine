import type {
	GenesisClimate,
	GenesisOceanCurrents,
} from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type ComputeCycloneRiskParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	topography: Uint8Array
	params: Pick<GenesisParams, "hoursPerDay" | "tideLock">
	oceanCurrents?: GenesisOceanCurrents | null
}
