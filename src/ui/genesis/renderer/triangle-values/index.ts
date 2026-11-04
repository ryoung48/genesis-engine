import type { AverageTriangleValuesInput } from "@/ui/genesis/renderer/triangle-values/types"

function average({ mesh, values }: AverageTriangleValuesInput): Float32Array {
	const result = new Float32Array(mesh.numTriangles)
	for (let triangle = 0; triangle < mesh.numTriangles; triangle++) {
		const offset = triangle * 3
		result[triangle] =
			(values[mesh.s_begin_r[offset]] +
				values[mesh.s_begin_r[offset + 1]] +
				values[mesh.s_begin_r[offset + 2]]) /
			3
	}
	return result
}

export const TRIANGLE_VALUES = { average }
