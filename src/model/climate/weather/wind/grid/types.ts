export type DynamicsGrid = {
	lonBins: number
	latBins: number
	values: Float32Array
}

export type BuildGridInput = {
	latDeg: Float32Array
	lonDeg: Float32Array
	values: Float32Array
}

export type SampleGridInput = {
	grid: DynamicsGrid
	latDeg: Float32Array
	lonDeg: Float32Array
}
