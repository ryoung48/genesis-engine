import type { SphereMesh } from "@/model/mesh/types"

export interface SpreadStep {
	from: number
	to: number
}

export interface SpreadParams {
	mesh: Pick<SphereMesh, "adjOffset" | "adjList" | "r_xyz">
	radiusKm: number
	dist: Float64Array
	maxKm: number
	canEnter: (step: SpreadStep) => boolean
	onReach: (step: SpreadStep) => void
}

export interface ComponentsParams {
	mesh: Pick<SphereMesh, "numRegions" | "adjOffset" | "adjList">
	isMember: (cell: number) => boolean
	canConnect: (step: SpreadStep) => boolean
}

export interface BlurRecordParams {
	mesh: SphereMesh
	land: Uint8Array
	fields: Float32Array[]
	strides: number[]
	neighbour: number
}

export interface NearestLandParams {
	mesh: SphereMesh
	land: Uint8Array
}

export interface NeighbourAverageParams {
	mesh: SphereMesh
	field: Float32Array
	include: Uint8Array
	passes: number
}
