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

export interface GenesisParams {
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
	spectralClass: string // stellar spectral class, default "G"
	starSubtype: number // spectral subtype 0–9, default 2.0 (G2 ≈ Sol)
	orbitalDistanceAU: number // orbital semi-major axis in AU, default 1.0
	daysPerYear: number // orbital year length in local days, default 365
	hoursPerDay: number // rotation period expressed as local hours per day, default 24
	tideLock: import("../celestial/moons/moon-types").TideLock | null // null = not locked
	substellarLon: number // longitude of the substellar point in degrees (0-360), default 0
	perihelion: number // argument of perihelion in degrees (0-360), default 90
	pressure?: number // atmospheric pressure in bars, default 1.0
	/** Real per-body Bond albedo override (0..1) -- pass this for a known real
	 * body (e.g. Sol's Earth, see sol-system.ts's SolPlanetSeed.albedo doc);
	 * leave unset for a procedurally generated world, which falls back to
	 * EMB_CONSTANTS.surface.ALBEDO.BASE. */
	albedo?: number
	/** Real per-body EBM greenhouseFactor override -- pass this alongside
	 * albedo for a known real body (see ebm/index.ts's EBMConfig.
	 * greenhouseFactor doc for what it means and how it's fit); leave unset
	 * for a procedurally generated world, which falls back to
	 * EMB_CONSTANTS.surface.GREENHOUSE_FACTOR. */
	greenhouseFactor?: number
	/** Geologic/tidal heating (system-seismology.ts's SeismologyProfile.
	 * totalHeating), applied on top of the EBM's own solved equilibrium --
	 * see ebm/index.ts's EBMConfig.seismologyTotalHeatingK doc. 0/unset for
	 * the overwhelming majority of bodies; only matters for a geologically or
	 * tidally active world/moon (e.g. an Io-analog). Never pass this for a
	 * jovian -- see that doc's explanation of why it breaks their
	 * temperature calibration. */
	seismologyTotalHeatingK?: number
	/** Seed for the sibling/system bodies shown in the Generation panel; 0 = Sol. Not used by terrain generation. */
	restSeed?: number
	/** Society era preset; controls population, settlement coverage, and nation-formation thresholds */
	era?: import("../society/eras").SocietyEra
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

export const GENESIS_TERRAIN_FEATURE_LABELS = [
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

export const GENESIS_TERRAIN_FEATURE = {
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

export interface GenesisTerrainFeatures {
	/** Per-cell bitmask of terrain features applied during blendElevation. */
	featureMask: Uint32Array
	/** Per-cell strongest contributing feature, index into GENESIS_TERRAIN_FEATURE_LABELS. */
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
