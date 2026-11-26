import type { SphereMesh } from "@/model/mesh/types"

export interface SimMesh {
	mesh: SphereMesh
	edgeRad: number
	nearest: (params: NearestCellParams) => number
}

export interface NearestCellParams {
	x: number
	y: number
	z: number
}

export interface SimSpace {
	mesh: SphereMesh
	radiusKm: number
	edgeKm: number
	nearest: SimMesh["nearest"]
}

export interface CellDistanceParams {
	space: SimSpace
	a: number
	b: number
}

export interface DijkstraParams {
	space: SimSpace
	isSource: (cell: number) => boolean
	canEnter: (cell: number) => boolean
	maxKm: number
	carry: (cell: number) => number
}

export interface DijkstraResult {
	km: Float64Array
	carried: Float32Array
}

export interface ComponentsParams {
	space: SimSpace
	isMember: (cell: number) => boolean
}
