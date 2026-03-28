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
	landDistribution: number
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
	craters?: number           // 0 = none, 1 = heavily cratered
	planetRadiusKm?: number
	obliquity?: number    // axial tilt in degrees, default 23.5
	eccentricity?: number // orbital eccentricity, default 0.0167
	sunTempFactor?: number // stellar temperature factor, 1.0 = Sol
	daysPerYear?: number // orbital year length in local days, default 365
	hoursPerDay?: number // rotation period expressed as local hours per day, default 24
	tidallyLocked?: boolean // true = one hemisphere always faces the star
	pressure?: number // atmospheric pressure in bars, default 1.0
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
	daylight_hours_monthly: Float32Array // flattened [month * numRegions + region] daylight hours
	landFraction: number[]          // 36-band land fraction used by EBM
}

export interface OrogenOceanCurrents {
	/** Per-cell ocean warmth: -1 (cold) to +1 (warm). Zero for land. */
	oceanWarmth: Float32Array
	/** Per-cell diffused coastal warmth on land: -1..+1. Zero for ocean/deep interior. */
	coastalWarmth: Float32Array
}

export interface OrogenWind {
	/** Per-cell eastward wind component, [month * N + r] */
	wind_east_monthly: Float32Array
	/** Per-cell northward wind component, [month * N + r] */
	wind_north_monthly: Float32Array
	/** Per-cell wind speed (0–1 normalized), [month * N + r] */
	wind_speed_monthly: Float32Array
}

export interface OrogenRainfall {
	monthly: Float32Array   // [month * N + r] mm
	annual: Float32Array    // per-cell annual mm
	east: Float32Array      // per-cell normalized east moisture (0–1)
	west: Float32Array      // per-cell normalized west moisture (0–1)
}

export interface OrogenProvinces {
	/** Per-region province index (-1 = ocean/unassigned) */
	regionProvince: Int32Array
	/** Seed (capital) region for each province */
	seeds: Int32Array
	/** Number of provinces */
	count: number
	/** Per-province desolate flag (1 = uninhabitable) */
	desolate: Uint8Array
	/** Province adjacency — CSR offset, length count+1 */
	adjOffset: Int32Array
	/** Province adjacency — neighbor indices */
	adjList: Int32Array
	/** Per-province land region count */
	size: Int32Array
	/** Per-province RGB colors, length count*3 */
	colors: Float32Array
}

export interface OrogenRivers {
	/** Each river is a polyline of [lonDeg, latDeg, flow, elevation] quads */
	lines: [number, number, number, number][][]
	/** Maximum flow value for normalization */
	maxFlow: number
	/** Flow threshold (minimum flow for a river cell) */
	minFlow: number
	/** Per-cell flag for cells that belong to a rendered river polyline */
	visible: Uint8Array
	/** Per-cell lake flag (1 = lake surface, 0 = not) */
	lakes: Uint8Array
	/** Per-cell water surface elevation (only meaningful for lake cells) */
	waterLevel: Float32Array
}

export const OROGEN_TOPOGRAPHY_LABELS = [
	"flat",
	"hills",
	"plateus",
	"mountains",
	"marsh",
	"coastal",
	"ocean",
	"lake",
] as const

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
	/** Per-cell pasta climate code (0=fallback/ocean, 1+=PASTA_LABELS order) */
	pastaClimate?: Uint8Array
	/** Per-cell ice thickness in mm water equivalent (0 for ice-free) */
	iceThickness?: Float32Array
	/** Per-cell minimum ice across final-year months (mm w.e.) — for sea ice classification */
	iceMinMonthly?: Float32Array
	/** Per-cell maximum ice across final-year months (mm w.e.) — for sea ice classification */
	iceMaxMonthly?: Float32Array
	/** Per-cell Koppen climate code (index into KOPPEN_CLASSES) */
	koppenClimate?: Uint8Array
	/** Ocean current warmth (ocean cells) and diffused coastal warmth (land cells) */
	oceanCurrents?: OrogenOceanCurrents
	/** Monthly wind fields */
	wind?: OrogenWind
	/** Per-cell biome code (0=ocean, 1=desert, 2=sparse, 3=grasslands, 4=woods, 5=forest, 6=jungle) */
	vegetation?: Uint8Array
	/** Per-cell topography code, index into OROGEN_TOPOGRAPHY_LABELS */
	topography?: Uint8Array
	rivers?: OrogenRivers
	isLand?: Uint8Array
	riverLand?: Uint8Array
	provinces?: OrogenProvinces
	landmarks?: import("./provinces/landmarks").OrogenLandmarks
	population?: import("./provinces/population").ProvincePopulation
	continentCount?: number
	/** Pre-computed monthly thermal equator latitude (deg) per longitude bin, 12 months */
	monthlyTEQ?: Float32Array[]
}
