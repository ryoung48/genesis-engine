import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface ComputeLocationsParams {
	provinces: GenesisProvinces
	mesh: SphereMesh
	seed: number
	options?: { planetRadiusKm?: number }
}
