import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface ProvinceDepositsParams {
	provinces: Pick<GenesisProvinces, "count" | "regionProvince">
	mesh: Pick<SphereMesh, "numRegions" | "regionArea">
	rows: Uint8Array
}

export interface ProvinceDeposits {
	richness: Float32Array
	rich: Float32Array
}
