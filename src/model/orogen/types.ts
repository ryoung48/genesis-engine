export interface SphereMesh {
	numRegions: number
	numTriangles: number
	numSides: number
	/** Flat xyz coords for each region center, length 3*numRegions */
	r_xyz: Float32Array
	/** Flat xyz coords for each triangle circumcenter, length 3*numTriangles */
	t_xyz: Float32Array
	/** Delaunay triangle indices, length 3*numTriangles */
	triangles: Int32Array
	/** Opposite halfedge for each side */
	halfedges: Int32Array
	/** CSR adjacency offset array, length numRegions+1 */
	adjOffset: Int32Array
	/** CSR adjacency list (neighbor region indices) */
	adjList: Int32Array
	/** Per-edge Euclidean distance between adjacent region centers */
	neighborDist: Float32Array
	/** For each side s, the region where the side begins */
	s_begin_r: Int32Array
	/** For each side s, the region where the side ends */
	s_end_r: Int32Array
	/** For each side s, the triangle on the inner (left) side */
	s_inner_t: Int32Array
	/** For each side s, the triangle on the outer (right) side */
	s_outer_t: Int32Array
}

export interface TectonicPlate {
	id: number
	isOcean: boolean
	/** Euler pole axis [x, y, z] */
	pole: [number, number, number]
	/** Angular velocity */
	omega: number
	/** Set of region indices belonging to this plate */
	regions: Set<number>
	/** Growth rate for flood fill */
	growthRate: number
	/** Preferred growth direction [x, y, z] */
	growthDir: [number, number, number]
	/** Directional bias strength */
	dirStrength: number
}

/** Plate vector: Euler pole + angular velocity (used for coarse plate representation) */
export interface PlateVec {
	pole: [number, number, number]
	omega: number
}

export interface OrogenParams {
	seed: number
	numPoints: number
	numPlates: number
	numContinents: number
	continentSizeVariety: number
	landCoverage: number
	jitter: number
	roughness: number
	terrainWarp: number
	smoothing: number
	hydraulicErosion: number
	thermalErosion: number
	ridgeSharpening: number
	glacialErosion: number
	planetRadiusKm?: number
	obliquity?: number    // axial tilt in degrees, default 23.5
	eccentricity?: number // orbital eccentricity, default 0
}

/** Result of findCollisions for one plate layer */
export interface CollisionResult {
	mountain_r: Set<number>
	coastline_r: Set<number>
	ocean_r: Set<number>
	r_stress: Float32Array
	r_subductFactor: Float32Array
	r_boundaryType: Int8Array
	r_bothOcean: Uint8Array
	r_hasOcean: Uint8Array
}

export interface BoundaryInfo {
	mountain_r: Set<number>
	coastline_r: Set<number>
	ocean_r: Set<number>
	r_stress: Float32Array
	r_subductFactor: Float32Array
	r_boundaryType: Int8Array
	r_bothOcean: Uint8Array
	r_hasOcean: Uint8Array
}

export interface DistanceFields {
	distMountain: Float32Array
	distOcean: Float32Array
	distCoastline: Float32Array
	distCoast: Float32Array
	distCoastLand: Float32Array
}

export interface SuperPlateData {
	r_superPlate: Int32Array
	superPlateVec: Map<number, PlateVec>
	superPlateIsOcean: Set<number>
	superPlateDensity: Map<number, number>
	numSuperPlates: number
}

export interface OrogenClimate {
	temperature_avg: Float32Array   // per-cell annual mean °C
	temperature_min: Float32Array   // per-cell annual min °C
	temperature_max: Float32Array   // per-cell annual max °C
	temperature_monthly: Float32Array // flattened [month * numRegions + region] mean °C
	landFraction: number[]          // 36-band land fraction used by EBM
}

export interface OrogenRainfall {
	monthly: Float32Array   // [month * N + r] mm
	annual: Float32Array    // per-cell annual mm
	east: Float32Array      // per-cell normalized east moisture (0–1)
	west: Float32Array      // per-cell normalized west moisture (0–1)
}

export interface OrogenRivers {
	/** Each river is a polyline of [lonDeg, latDeg, flow, elevation] quads */
	lines: [number, number, number, number][][]
	/** Maximum flow value for normalization */
	maxFlow: number
	/** Flow threshold (minimum flow for a river cell) */
	minFlow: number
}

export interface OrogenWorld {
	mesh: SphereMesh
	plates: TectonicPlate[]
	plateAssignment: Int32Array
	boundary: BoundaryInfo
	distFields: DistanceFields
	elevation: Float32Array
	params: OrogenParams
	climate?: OrogenClimate
	/** Distance from nearest ocean cell in km (land cells only, 0 for ocean) */
	oceanDist?: Float32Array
	rainfall?: OrogenRainfall
	/** Per-cell climate zone code (0=ocean, 1=arctic, 2=subarctic, 3=boreal, 4=temperate, 5=subtropical, 6=tropical, 7=infernal, 8=chaotic) */
	climateZones?: Uint8Array
	/** Per-cell biome code (0=ocean, 1=desert, 2=sparse, 3=grasslands, 4=woods, 5=forest, 6=jungle) */
	vegetation?: Uint8Array
	rivers?: OrogenRivers
}
