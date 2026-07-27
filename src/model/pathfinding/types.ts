import type { MinHeap } from "@/model/shared/min-heap"

export interface PathfindRequest {
	startRegion: number
	endRegion: number
	allowLand: boolean
	allowSea: boolean
}

export interface PathfindResult {
	pathRegions: number[]
	distanceKm: number
	landKm: number
	seaKm: number
	travelDays: number
	reachable: boolean
}

export interface PathfindGraph {
	numRegions: number
	adjOffset: Int32Array
	adjList: Int32Array
	r_xyz: Float32Array
	regionIsLand: Uint8Array | null
	vegetation: Uint8Array | null
	topography: Uint8Array | null
	waterDepth: Int32Array | null
	routeEdges: Set<number>
	planetRadiusKm: number
	regionProvince: Int32Array | null
	desolate: Uint8Array | null
}

export interface SearchWorkspace {
	distance: Float32Array
	prev: Int32Array
	queued: Int32Array
	settled: Int32Array
	heap: MinHeap
}

export interface ComputeWaterDepthParams {
	numRegions: number
	adjOffset: Int32Array
	adjList: Int32Array
	regionIsLand: Uint8Array | null
}

export interface PairKeyParams {
	a: number
	b: number
	span: number
}

export interface ComputeEdgeCostParams {
	graph: PathfindGraph
	from: number
	to: number
	allowLand: boolean
	allowSea: boolean
}

export interface PathfindParams {
	graph: PathfindGraph
	request: PathfindRequest
}
