import type { GenesisClimate } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"

export type OceanGridInput = {
	mesh: SphereMesh
	ocean: Uint8Array
	elevation: Float32Array
	climate: GenesisClimate
	radius: number
}

export type OceanGrid = {
	mesh: SphereMesh
	source: Int32Array
	region: Int32Array
	ocean: Uint8Array
	elevation: Float32Array
	climate: GenesisClimate
	area: Float64Array
	a: Int32Array
	b: Int32Array
	eastA: Float64Array
	northA: Float64Array
	eastB: Float64Array
	northB: Float64Array
	width: Float64Array
	distance: Float64Array
	minimumLength: number
}
