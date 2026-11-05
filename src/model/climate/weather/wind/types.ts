import type { SphereMesh } from "@/model/mesh/types"

export interface FlowGrid {
	// Eastward component per cell, row-major lat×lon.
	u: Float32Array
	// Northward component per cell.
	v: Float32Array
	// Approximate wind speed (m/s) per cell.
	speed: Float32Array
	// Optional scalar field used for particle coloring or spawn masking.
	scalar?: Float32Array
	// Optional active-cell mask (1 = active, 0 = inactive).
	mask?: Uint8Array
	// Grid width (360 = 1° per column, lon -180…179).
	width: 360
	// Grid height (181 = 1° per row, lat -90…90).
	height: 181
}

interface RasterizeVectorGridOptions {
	scalar?: Float32Array
	allowCell?: (region: number) => boolean
	isBlockedRegion?: (region: number) => boolean
}

export interface RasterizeVectorGridInput {
	mesh: SphereMesh
	vectorU: Float32Array
	vectorV: Float32Array
	vectorSpeed: Float32Array
	options?: RasterizeVectorGridOptions
}

export interface WindArrowData {
	lat: Float32Array
	lon: Float32Array
	u: Float32Array
	v: Float32Array
	// Approximate surface wind speed in m/s.
	speed: Float32Array
}

export type WindGrid = FlowGrid

export interface GenesisWindMonthly {
	u: Float32Array // [month * N + r] eastward, m/s
	v: Float32Array // [month * N + r] northward, m/s
}

export type WindVectors = {
	windU: Float32Array
	windV: Float32Array
	pressure: Float32Array
	windSpeed: Float32Array
}
