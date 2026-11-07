export type ApplyBorderShadowParams = {
	rgb: Float32Array
	owner: Int32Array
	adjOffset: Int32Array
	adjList: Int32Array
	// [JUSTIFICATION] The galaxy tunes edge and interior brightness separately from the planet default.
	shading?: { edgeBrightness: number; interiorWash: number }
}

export type ApplyWavesParams = {
	rgb: Float32Array
	isLand: Uint8Array
	distCoast: Float32Array
}
