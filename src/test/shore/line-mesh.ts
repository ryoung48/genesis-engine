import type { SphereMesh } from "@/model/mesh/types"

export const LINE_STEP_DEG = 0.05
export const LINE_RADIUS_KM = 6371

export function lineMesh(count: number): SphereMesh {
	const step = (LINE_STEP_DEG * Math.PI) / 180
	const r_xyz = new Float32Array(3 * count)
	for (let i = 0; i < count; i++) {
		r_xyz[3 * i] = Math.cos(i * step)
		r_xyz[3 * i + 1] = Math.sin(i * step)
	}
	const offsets = [0]
	const list: number[] = []
	const dist: number[] = []
	for (let i = 0; i < count; i++) {
		for (const j of [i - 1, i + 1]) {
			if (j < 0 || j >= count) continue
			list.push(j)
			dist.push(
				Math.hypot(
					r_xyz[3 * i] - r_xyz[3 * j],
					r_xyz[3 * i + 1] - r_xyz[3 * j + 1],
					r_xyz[3 * i + 2] - r_xyz[3 * j + 2],
				),
			)
		}
		offsets.push(list.length)
	}
	return {
		numRegions: count,
		r_xyz,
		adjOffset: Int32Array.from(offsets),
		adjList: Int32Array.from(list),
		neighborDist: Float32Array.from(dist),
	} as SphereMesh
}
