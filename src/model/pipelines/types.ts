export interface SampleBilinearParams {
	pixels: Uint8Array
	imgW: number
	imgH: number
	px: number
	py: number
}

export interface SampleSingleBandFloatRasterParams {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	scale: number
	nodata: number
}

export interface SampleCategoricalRasterParams {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	nodata: number
}
