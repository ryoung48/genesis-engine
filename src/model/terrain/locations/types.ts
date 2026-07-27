import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisProvinces } from "@/model/types/society"

export interface ComputeLocationsParams {
	provinces: GenesisProvinces
	mesh: SphereMesh
	seed: number
	options?: { planetRadiusKm?: number }
}
