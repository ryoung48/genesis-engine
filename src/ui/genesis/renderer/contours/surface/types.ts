import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export type ContourWorld = Pick<SerializedGenesisWorld, "mesh" | "elevation_km">

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
