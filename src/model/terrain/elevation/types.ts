import type { SphereMesh } from "@/model/mesh/types"
import type {
	BoundaryInfo,
	DistanceFields,
	PlateVec,
} from "@/model/tectonics/types"

export type StageTiming = { Stage: string; ms: string }

export interface BoundedBfsParams {
	dist: Float32Array
	seeds: number[]
	halfWidth: number
	adjOffset: Int32Array
	adjList: Int32Array
	canVisit: (nr: number, r: number) => boolean
}

export interface ComputeDistanceFieldsParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateIsOcean: Set<number>
	boundary: BoundaryInfo
	seed: number
}

export interface AssignDistanceFieldParams {
	mesh: SphereMesh
	seeds: Iterable<number>
	stops: Set<number>
	seedVal: number
}

export interface BlendElevationParams {
	mesh: SphereMesh
	r_plate: Int32Array
	plateVec: Map<number, PlateVec>
	plateIsOcean: Set<number>
	distFields: DistanceFields
	boundary: BoundaryInfo
	roughness: number
	volcanism: number
	seed: number
	timing?: StageTiming[]
}
