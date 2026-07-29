import type { SphereMesh } from "@/model/mesh/types"

export interface SampleBilinearParams {
	pixels: Uint8Array
	imgW: number
	imgH: number
	px: number
	py: number
}

export interface SampleHeightmapParams {
	mesh: SphereMesh
	grayscale: Uint8Array
	imgW: number
	imgH: number
}

export interface SampleSingleBandFloatRasterParams {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	scale: number
	nodata: number
}

export interface SampleCoastlineMaskParams {
	mesh: SphereMesh
	mask: Uint8Array
	maskW: number
	maskH: number
}

export interface SampleCategoricalRasterParams {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	nodata: number
}
