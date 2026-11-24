import type { PlateMotion } from "@/model/geography/tectonics/plate-motion/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface Front {
	pa: number
	pb: number
	edges: number[]
	id: number
	activeMyr: number
}

export interface FrontEdges {
	count: number
	cellA: Int32Array
	cellB: Int32Array
	plateA: Int32Array
	plateB: Int32Array
	closingCmYr: Float32Array
	alongCmYr: Float32Array
	overA: Uint8Array
}

export interface PlateFronts {
	edges: FrontEdges
	subduction: Front[]
	ridge: Front[]
	collision: Front[]
	rift: Front[]
	transform: Front[]
}

export interface BuildPlateFrontsParams {
	mesh: SphereMesh
	motion: PlateMotion
	planetRadiusKm: number
	seed: number
	durationGroup: (plate: number) => number
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
	along: number
}

export interface ClassifyEdgesParams {
	mesh: SphereMesh
	motion: PlateMotion
}

export type TimedFrontKind = "subduction" | "collision" | "rift" | "transform"

export interface DrawActiveMyrParams {
	seed: number
	kind: TimedFrontKind
	id: number
}
