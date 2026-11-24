import type {
	Front,
	PlateFronts,
} from "@/model/geography/tectonics/plate-fronts/types"
import type { SimMesh } from "@/model/geography/tectonics/sim-mesh/types"
import type { SphereMesh } from "@/model/mesh/types"

export type SimFrontKind =
	| "ridge"
	| "rift"
	| "subduction"
	| "collision"
	| "transform"

export interface WorldSample {
	regionOfCell: Int32Array
	cellOfRegion: Int32Array
}

export interface SimFront {
	kind: SimFrontKind
	plateA: number
	plateB: number
	id: number
	cells: Int32Array
	cellClosingCmYr: Float32Array
	cellAlongCmYr: Float32Array
	overPlate: number
	rateCmYr: number
	activeMyr: number
}

export interface BuildWorldSampleParams {
	simMesh: SimMesh
	mesh: SphereMesh
}

export interface GatherParams<T extends TypedField> {
	sample: WorldSample
	field: T
}

export type TypedField =
	| Float32Array
	| Uint8Array
	| Int8Array
	| Int32Array
	| Uint32Array

export interface SampleFrontsParams {
	sample: WorldSample
	fronts: PlateFronts
	minCells: number
}

export interface PushFrontsParams {
	into: SimFront[]
	kind: SimFrontKind
	list: Front[]
	sample: WorldSample
	fronts: PlateFronts
	minCells: number
}
