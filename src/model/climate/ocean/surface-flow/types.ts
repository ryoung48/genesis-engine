import type { GenesisOceanCurrents } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"

// Per-edge offsets in degrees, aligned with the mesh adjacency list.
export type EdgeGeometry = {
	dx: Float64Array
	dy: Float64Array
	distSq: Float64Array
}

export type SstGradientFlowParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	sst: Float32Array
	fSign: Int8Array
	edges: EdgeGeometry
}

export type SurfaceFlowField = {
	u: Float32Array
	v: Float32Array
}

export type SstFieldsFlowParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	fSign: Int8Array
	sst: Float32Array
	sstMonthly: Float32Array
}

export type SurfaceFlowFields = Pick<
	GenesisOceanCurrents,
	"flowU" | "flowV" | "flowUMonthly" | "flowVMonthly"
>

export type DisplayMonthParams = {
	oceanCurrents: GenesisOceanCurrents
	numRegions: number
	month: number
}

export type DisplayMonthFields = {
	sst: Float32Array
	u: Float32Array
	v: Float32Array
}

export type SurfaceFlowGridParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	fields: DisplayMonthFields
	allowCell: (region: number) => boolean
}
