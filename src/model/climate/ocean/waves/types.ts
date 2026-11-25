import type { SphereMesh } from "@/model/mesh/types"

export interface OceanWaveField {
	adjOffset: Int32Array
	adjList: Int32Array
	neighborDist: Float32Array
	r_xyz: Float32Array
	openWater: Uint8Array
	radiusKm: number
	gravityMs2: number
}

export interface OceanSeaIce {
	perennial: boolean
	seasonal: boolean
}

export interface OceanWaveFieldParams {
	mesh: Pick<SphereMesh, "adjOffset" | "adjList" | "neighborDist" | "r_xyz">
	openWater: Uint8Array
	planetRadiusKm: number
}

export interface OceanFetchParams {
	field: OceanWaveField
	sea: number
	windU: number
	windV: number
}

export interface OceanWaveHeightParams {
	windSpeedMs: number
	fetchKm: number
	gravityMs2: number
}

export interface OceanIceCoveredParams {
	ice: OceanSeaIce
	temperatureNormalC: number
}
