import type { GenesisClimate } from "@/model/climate/types"
import type { ClimateV2Circulation } from "@/model/climatev2/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type ComputeCycloneRiskParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	topography: Uint8Array
	circulation: ClimateV2Circulation | null
	rainfallAnnual: Float32Array
	params: Pick<GenesisParams, "hoursPerDay">
}
