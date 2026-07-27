import type { SphereMesh } from "@/model/mesh/types"
import type { BoundaryInfo, DistanceFields } from "@/model/tectonics/types"

export interface PropagateInfluenceParams {
	mesh: SphereMesh
	seeds: number[]
	base: Float32Array
	decay: number
	minValue: number
}

export interface ComputeHazardsParams {
	mesh: SphereMesh
	boundary: BoundaryInfo
	distFields: DistanceFields
	elevationKm: Float32Array
	isLand: Uint8Array
	hotspot?: Float32Array
}

export interface PercentileParams {
	values: number[]
	q: number
}

export interface NormalizeFieldParams {
	values: Float32Array
	percentileQ: number
}

export interface ThresholdFieldParams {
	source: Float32Array
	minValue: number
}

export interface GradualFalloffParams {
	distance: number
	reach: number
	power?: number
}
