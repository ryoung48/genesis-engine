export interface GalaxyStageTiming {
	stage: string
	ms: number
}

export interface GalaxyParams {
	size: number
	seed: number
	radius: { min: number; max: number }
	dimensions: { w: number; h: number }
	/** When set, the worker eagerly generates full bodies (planets/moons, no
	 * climate) for every non-edge system right after the galaxy layout itself,
	 * instead of leaving that to whenever a system is actually opened -- see
	 * GalaxyWorkerDoneResponse.systems. */
	pregenerateAllSystems?: boolean
	/** Density-wave shape knobs forwarded straight to GALAXY_PACKING.place --
	 * see packing/index.ts's own doc comment. Left optional (falling back to
	 * that module's own defaults) so existing callers that only care about
	 * plain size/seed/radius/dimensions don't need to change. */
	eccentricityInner?: number
	eccentricityOuter?: number
	angleWindPerUnit?: number
	pertN?: number
	pertAmp?: number
}

export interface Galaxy {
	seed: number
	numSystems: number
	/** Interleaved [x0,y0, x1,y1, …], length 2*numSystems. */
	r_xy: Float32Array
	/** 1 = boundary/edge system (outside the playable ring), 0 = real system. */
	r_edge: Uint8Array
	/** CSR row offsets, length numSystems+1. */
	adjOffset: Int32Array
	/** CSR flat neighbor indices (full Delaunay adjacency). */
	adjList: Int32Array
	/** Flat hyperlane pairs [a0,b0, a1,b1, …], length 2*laneCount. */
	lanes: Int32Array
	laneCount: number
	/** CSR row offsets into the flat star* arrays below, length numSystems+1
	 * -- see GALAXY_SYSTEMS.buildPackedGalaxyStars, ported from galaxy-gen's
	 * ScaledGalaxy.systemStarOffset. Every system's full star tree is rolled
	 * once here (in the worker) rather than lazily re-rolled per system on
	 * the main thread. */
	systemStarOffset: Int32Array
	/** Local (per-system) parent star index, -1 for a system's primary. */
	starParent: Int32Array
	/** Encoded StarRole per star (see galaxy/systems/codes.ts). */
	starRole: Uint8Array
	/** Encoded SpectralClass per star (O-M plus brown dwarf/white dwarf/
	 * neutron star/black hole). */
	starSpectralClass: Uint8Array
	/** Encoded LuminosityClass per star. */
	starLuminosityClass: Uint8Array
	/** Continuous 0-10 spectral subtype per star. */
	starSubtype: Float32Array
	/** Companion orbit deviation per star; 0 for a system's primary. */
	starDeviation: Float32Array
	/** Companion orbit eccentricity; 0 for a system's primary. */
	starEccentricity: Float32Array
	/** Companion orbit inclination in degrees; 0 for a system's primary. */
	starInclinationDeg: Float32Array
	/** Rolled star age in Gyr, shared by every star in one companion tree. */
	starAge: Float32Array
	starMass: Float32Array
	starDiameter: Float32Array
	starTemperature: Float32Array
	starLuminosity: Float32Array
	starMao: Float32Array
	/** Nation index per system, -1 for edge/boundary systems -- see
	 * GALAXY_NATIONS.build. */
	nationAssignment: Int32Array
	/** Capital system index per nation. */
	nationSeeds: Int32Array
	/** System count per nation. */
	nationSize: Int32Array
	/** Interleaved rgb (0-1) per nation. */
	nationColors: Float32Array
	radius: { min: number; max: number }
	dimensions: { w: number; h: number }
}
