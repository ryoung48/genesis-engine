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
	seaLevel: number
	volcanism?: number
	craters?: number // 0 = none, 1 = heavily cratered
	maxElevation?: number // max elevation in meters, default 6000
	planetRadiusKm: number
	obliquity: number // axial tilt in degrees, default 23.5
	eccentricity: number // orbital eccentricity, default 0.0167
	sunTempFactor: number // stellar temperature factor, 1.0 = Sol
	insolationFactor?: number // received stellar flux multiplier, 1.0 = baseline
	daysPerYear: number // orbital year length in local days, default 365
	hoursPerDay: number // rotation period expressed as local hours per day, default 24
	tidallyLocked: boolean // true = one hemisphere always faces the star
	antistellarLon: number // longitude of the antistellar point in degrees (0-360), default 180
	perihelion: number // argument of perihelion in degrees (0-360), default 90
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

export const OROGEN_TERRAIN_FEATURE_LABELS = [
	"none",
	"rift valley",
	"pull-apart basin",
	"back-arc basin",
	"fold ridges",
	"plateau uplift",
	"continental interior",
	"mid-ocean ridge",
	"fracture zone",
	"trench",
	"coastal roughening",
	"island arc",
	"volcanic arc",
	"large igneous province",
] as const

export const OROGEN_TERRAIN_FEATURE = {
	RIFT_VALLEY: 1,
	PULL_APART_BASIN: 2,
	BACK_ARC_BASIN: 3,
	FOLD_RIDGES: 4,
	PLATEAU_UPLIFT: 5,
	CONTINENTAL_INTERIOR: 6,
	MID_OCEAN_RIDGE: 7,
	FRACTURE_ZONE: 8,
	TRENCH: 9,
	COASTAL_ROUGHENING: 10,
	ISLAND_ARC: 11,
	VOLCANIC_ARC: 12,
	LARGE_IGNEOUS_PROVINCE: 13,
} as const

export interface OrogenTerrainFeatures {
	/** Per-cell bitmask of terrain features applied during blendElevation. */
	featureMask: Uint32Array
	/** Per-cell strongest contributing feature, index into OROGEN_TERRAIN_FEATURE_LABELS. */
	dominantFeature: Uint8Array
	/** Internal helper used while later pipeline stages keep feature dominance accurate. */
	dominantMagnitude?: Float32Array
}

export interface StageTiming {
	Stage: string
	ms: string
}

export interface SuperPlateData {
	r_superPlate: Int32Array
	superPlateVec: Map<number, PlateVec>
	superPlateIsOcean: Set<number>
	superPlateDensity: Map<number, number>
	numSuperPlates: number
}
