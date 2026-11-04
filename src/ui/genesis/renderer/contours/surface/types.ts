import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export type ContourWorld = {
	mesh: Pick<
		SerializedGenesisWorld["mesh"],
		| "numRegions"
		| "numTriangles"
		| "adjOffset"
		| "adjList"
		| "neighborDist"
		| "r_xyz"
		| "t_xyz"
		| "s_begin_r"
		| "s_inner_t"
		| "s_outer_t"
	>
	elevation_km: Float32Array
}

export type ContourSurface = {
	regionElevationKm: Float32Array
	contourTriangleElevationKm: Float32Array
	triangleElevationKm: Float32Array
	regionSlopes: Float32Array
	triangleSlopes: Float32Array
}

export type WriteContourControlsInput = {
	world: ContourWorld
	surface: ContourSurface
	innerTriangle: number
	outerTriangle: number
	region: number
	mapOrder: boolean
	controls: Float32Array
	face: number
}
