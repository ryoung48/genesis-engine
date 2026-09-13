export type SolveScalarParams = {
	ocean: Uint8Array
	source: Float32Array
	west: Float32Array
	east: Float32Array
	south: Float32Array
	north: Float32Array
	diagonal: Float32Array
	maxSweeps: number
	residualTolerance: number
	residualCheckInterval: number
}
