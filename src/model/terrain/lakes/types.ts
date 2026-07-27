import type { GenesisRainfall } from "@/model/types/climate"
import type { SphereMesh } from "@/model/types/mesh"

export interface SelectCompactLakeFallbackParams {
	numRegions: number
	adjOffset: Int32Array
	adjList: Int32Array
	elevation: Float32Array
	lakeCells: number[]
	targetCellCount: number
}

export interface TrimLakeCorridorsParams {
	numRegions: number
	adjOffset: Int32Array
	adjList: Int32Array
	elevation: Float32Array
	basinCells: number[]
	lakeCells: number[]
}

export interface SelectConnectedLakeCellsParams {
	numRegions: number
	adjOffset: Int32Array
	adjList: Int32Array
	elevation: Float32Array
	basinCells: number[]
	targetCellCount: number
}

export interface ComputeLakesParams {
	mesh: Pick<SphereMesh, "numRegions" | "adjOffset" | "adjList">
	elevation: Float32Array
	rainfall: Pick<GenesisRainfall, "annual">
	waterLevel: Float32Array
	basinId: Int32Array
	isLand: Uint8Array
	emergedLand?: Uint8Array
	elevationKm?: Float32Array
}

export interface ComputeSubgraphNeighborCountParams {
	numRegions: number
	adjOffset: Int32Array
	adjList: Int32Array
	cells: number[]
}

export interface ComputeLakeSurfaceParams {
	lakeCells: number[]
	elevation: Float32Array
}

export interface EstimateSubgraphDiameterParams {
	numRegions: number
	adjOffset: Int32Array
	adjList: Int32Array
	cells: number[]
}
