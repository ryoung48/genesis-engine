import type {
	GenesisClimate,
	GenesisOceanCurrents,
} from "@/model/types/climate"
import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisParams } from "@/model/types/tectonics"

export type ComputeCycloneRiskParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	topography: Uint8Array
	params: Pick<GenesisParams, "hoursPerDay" | "tideLock">
	oceanCurrents?: GenesisOceanCurrents | null
}
