export interface TransmissivityParams {
	logK: Float32Array
	ksMs: Float64Array
	soilDepthM: Float32Array
	slope: Float32Array
	coldest: Float32Array
	active: Uint8Array
}

export interface TransmissivityAtParams {
	logK: number
	ksMs: number
	soilDepthM: number
	slope: number
	coldest: number
}
