import type { SphereMesh } from "@/model/mesh/types"

export type AverageTriangleValuesInput = {
	mesh: Pick<SphereMesh, "numTriangles" | "s_begin_r">
	values: Float32Array
}
