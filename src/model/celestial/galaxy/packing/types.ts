export interface GalaxyPackingParams {
	size: number
	seed: number
	radius: { min: number; max: number }
	dimensions: { w: number; h: number }
}

export interface GalaxyPacking {
	/** Interleaved [x0,y0, x1,y1, …], length 2*size. */
	r_xy: Float32Array
	/** 1 = boundary/edge system (outside the playable ring), 0 = real system. */
	r_edge: Uint8Array
}
