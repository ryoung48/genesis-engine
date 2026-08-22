export interface GalaxyPackingParams {
	size: number
	seed: number
	radius: { min: number; max: number }
	dimensions: { w: number; h: number }
	/** Density-wave shape knobs -- all optional, defaulting to
	 * packing/index.ts's own constants. Exposed so a host can drive this
	 * model's spiral shape from another galaxy representation's live params
	 * (e.g. the ported beltoforion-style renderer's eccentricity/winding
	 * sliders) and have the two visually agree. */
	eccentricityInner?: number
	eccentricityOuter?: number
	/** Radians of ellipse tilt per world unit of radius -- see
	 * packing/index.ts's eccentricityAt/place. */
	angleWindPerUnit?: number
	/** Density-wave arm perturbation, ported from the beltoforion renderer's
	 * orbitPosition GLSL (Galaxy-Renderer-Typescript's Galaxy.ts calls this
	 * pertN/pertAmp) -- an additional per-star offset on top of the base
	 * ellipse, layered independently of eccentricity/tilt, that's what
	 * actually reads as "spiral arm" texture rather than a smooth ellipse
	 * field. Left undefined (no perturbation) unless a host explicitly
	 * drives it. */
	pertN?: number
	pertAmp?: number
}

export interface GalaxyPacking {
	/** Interleaved [x0,y0, x1,y1, …], length 2*size. */
	r_xy: Float32Array
	/** 1 = boundary/edge system (outside the playable ring), 0 = real system. */
	r_edge: Uint8Array
}
