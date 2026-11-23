import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface ProvinceGroundParams {
	provinces: Pick<GenesisProvinces, "count" | "regionProvince">
	mesh: Pick<SphereMesh, "numRegions" | "regionArea">
	elevationKm: Float32Array
	slopeScore: Float32Array
}

export interface ProvinceGround {
	plough: Float32Array
	terrace: Float32Array
}

export interface GroundFactorParams {
	slope: number
	edges: { edge0: number; edge1: number }
}

export interface GroundFitsParams {
	climateFit: Float64Array
	ground: ProvinceGround
}

export interface GroundFits {
	cropFit: Float64Array
	terraceFit: Float32Array
}

export interface TerraceShareParams {
	techLevel: number
}
