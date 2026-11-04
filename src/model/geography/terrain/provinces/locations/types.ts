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
	marine: ProvinceMarineLocation | null
}

export interface ProvinceMarineLocation {
	shore: number
	sea: ProvinceSampleLocation
}

export interface SelectMarineLocationParams {
	mesh: Pick<SphereMesh, "r_xyz" | "adjOffset" | "adjList">
	regions: number[]
	isLand: Uint8Array
	openWater: Uint8Array
	tidalRange: Float32Array | null
}

export interface BuildProvinceLocationsParams {
	mesh: Pick<
		SphereMesh,
		"numRegions" | "r_xyz" | "regionArea" | "adjOffset" | "adjList"
	>
	provinces: GenesisProvinces
	isLand: Uint8Array
	representatives: Map<number, [number, number]>
	openWater: Uint8Array | null
	tidalRange: Float32Array | null
}

export interface ResolveProvinceLocationParams {
	locations: ProvinceLocation[]
	province: number
}

export interface OpenNeighborCountParams {
	mesh: SelectMarineLocationParams["mesh"]
	openWater: Uint8Array
	region: number
}
