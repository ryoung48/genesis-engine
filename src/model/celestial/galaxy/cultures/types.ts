export interface BuildGalaxyCulturesParams {
	numSystems: number
	/** 1 = boundary/decorative ring system, excluded from culture claims. */
	r_edge: Uint8Array
	/** CSR adjacency cultures spread along -- the hyperlane graph
	 * (GalaxyTopology.laneAdjOffset/laneAdjList), same as GALAXY_NATIONS. */
	adjOffset: Int32Array
	adjList: Int32Array
	seed: number
}

export interface GalaxyCultures {
	/** Culture index per system, -1 for edge/unassigned systems. */
	assignment: Int32Array
	/** Seed (capital) system index per culture. */
	seeds: Int32Array
	/** System count per culture. */
	size: Int32Array
	/** Interleaved rgb (0-1) per culture -- a hue-shifted variant of the
	 * culture's (internal, not exposed) heritage-family color. */
	colors: Float32Array
	count: number
	/** Per-system secondary (bleeding) culture index, -1 = no blend -- the
	 * galaxy analogue of the province culture border-bleed. */
	blendSecondary: Int32Array
	/** Per-system blend weight [0.25, 0.5] toward blendSecondary. */
	blendWeight: Float32Array
}
