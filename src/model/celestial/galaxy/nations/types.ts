export interface BuildGalaxyNationsParams {
	numSystems: number
	/** 1 = boundary/decorative ring system, excluded from nation claims. */
	r_edge: Uint8Array
	/** Interleaved [x0,y0, x1,y1, …], length 2*numSystems. */
	r_xy: Float32Array
	/** Full Delaunay CSR adjacency (see GalaxyTopology). */
	adjOffset: Int32Array
	adjList: Int32Array
	seed: number
}

export interface GalaxyNations {
	/** Nation index per system, -1 for edge/unassigned systems. */
	assignment: Int32Array
	/** Capital system index per nation. */
	seeds: Int32Array
	/** System count per nation. */
	size: Int32Array
	/** Interleaved rgb (0-1) per nation. */
	colors: Float32Array
	count: number
}
