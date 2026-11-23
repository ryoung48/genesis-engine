import type { PlateMotion } from "@/model/geography/tectonics/plate-motion/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface Front {
	pa: number
	pb: number
	edges: number[]
	id: number
}

export interface SubductionFront extends Front {
	activeMyr: number
}

export interface FrontEdges {
	count: number
	cellA: Int32Array
	cellB: Int32Array
	plateA: Int32Array
	plateB: Int32Array
	closingCmYr: Float32Array
	overA: Uint8Array
}

export interface PlateFronts {
	edges: FrontEdges
	subduction: SubductionFront[]
	ridge: Front[]
}

export interface BuildPlateFrontsParams {
	mesh: SphereMesh
	motion: PlateMotion
	planetRadiusKm: number
	seed: number
}

export interface SmoothAlongParams {
	edges: FrontEdges
	group: number[]
	values: Float32Array[]
	iterations: number
}

export interface ClassifiedEdge {
	cellA: number
	cellB: number
	plateA: number
	plateB: number
	opening: number
	slip: number
}

export interface ClassifyEdgesParams {
	mesh: SphereMesh
	motion: PlateMotion
}
