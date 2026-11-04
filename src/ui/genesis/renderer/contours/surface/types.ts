import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export type ContourField = "elevation" | "tidal"

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
	tidalRange: Float32Array | null
	ocean: Uint8Array
}

export type ContourSurface = {
	regionValues: Float32Array
	contourTriangleValues: Float32Array
	triangleValues: Float32Array
	regionSlopes: Float32Array
	triangleSlopes: Float32Array
}

export type CreateContourSurfaceInput = {
	world: ContourWorld
	field: ContourField
}

export type WriteContourControlsInput = {
	world: ContourWorld
	surface: ContourSurface
	field: ContourField
	innerTriangle: number
	outerTriangle: number
	region: number
	mapOrder: boolean
	controls: Float32Array
	face: number
}
