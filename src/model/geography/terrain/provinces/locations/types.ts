import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface ProvinceSampleLocation {
	region: number
	weight: number
	xyz: [number, number, number]
}

export interface ProvinceLocation {
	province: number
	latitude: number
	longitude: number
	samples: ProvinceSampleLocation[]
	approximateLocation: boolean
}

export interface BuildProvinceLocationsParams {
	mesh: Pick<SphereMesh, "numRegions" | "r_xyz" | "regionArea">
	provinces: GenesisProvinces
	isLand: Uint8Array
	representatives: Map<number, [number, number]>
}

export interface ResolveProvinceLocationParams {
	locations: ProvinceLocation[]
	province: number
}
