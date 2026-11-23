import type { GenesisProvinces } from "@/model/society/types"

export interface WithinParams {
	graph: GenesisProvinces
	r_xyz: Float32Array
	planetRadiusKm: number
	province: number
	radiusKm: number
}
