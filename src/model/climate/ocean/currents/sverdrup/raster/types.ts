export type RasterVector = {
	x: Float32Array
	y: Float32Array
}

export type RasterIndex = {
	regionCell: Int32Array
	ocean: Uint8Array
}

export type BuildRasterIndexParams = {
	latDeg: Float32Array
	lonDeg: Float32Array
	isOcean: Uint8Array
}

export type AverageToRasterParams = {
	index: RasterIndex
	values: Float32Array
	include: Uint8Array | null
}

export type FillRasterGapsParams = {
	values: Float32Array
	filled: Uint8Array
}

export type SmoothRasterParams = {
	field: Float32Array
	mask: Uint8Array | null
	passes: number
}

export type SampleRasterParams = {
	field: Float32Array
	mask: Uint8Array
	latDeg: Float32Array
	lonDeg: Float32Array
	include: Uint8Array
}
