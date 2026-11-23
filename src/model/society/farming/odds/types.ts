import type { SphereMesh } from "@/model/mesh/types"
import type { ProvinceMeasures } from "@/model/society/farming/measures/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface OddsParams {
	measures: ProvinceMeasures
	provinces: GenesisProvinces
	landGraph: GenesisProvinces
	mesh: Pick<SphereMesh, "r_xyz">
	planetRadiusKm: number
	traversable: Uint8Array
}

export interface RankParams {
	values: Float64Array
	mask: Uint8Array
}

export interface RichnessParams {
	measures: ProvinceMeasures
	landGraph: GenesisProvinces
	r_xyz: Float32Array
	planetRadiusKm: number
}

export interface HearthOdds {
	odds: Float64Array
	timing: Float64Array
	dependence: Float64Array
}
