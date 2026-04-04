import {
	DEFAULT_ANTISTELLAR_LON,
	DEFAULT_DAYS_PER_YEAR,
	DEFAULT_ECCENTRICITY,
	DEFAULT_HOURS_PER_DAY,
	DEFAULT_OBLIQUITY_DEG,
	DEFAULT_PERIHELION,
	DEFAULT_PLANET_RADIUS_KM,
	DEFAULT_SUN_TEMP_FACTOR,
} from "@/model/orogen/units"

export const monthLabels = [
	"Annual",
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
]
export const gridSpacingOptions = [30, 15, 10, 5, 2.5]
export const PLANET_CODE_STORAGE_KEY = "orogen:lastPlanetCode"
export const RECENT_CODES_STORAGE_KEY = "orogen:recentCodes"
export const MAX_RECENT_CODES = 10

export const DEFAULT_WORLD_PARAMS = {
	numPoints: 204000,
	jitter: 0.75,
	numPlates: 80,
	landDistribution: 0.25,
	continentSizeVariety: 0.35,
	landCoverage: 0.3,
	roughness: 0.4,
	planetRadiusKm: DEFAULT_PLANET_RADIUS_KM,
	obliquity: DEFAULT_OBLIQUITY_DEG,
	eccentricity: DEFAULT_ECCENTRICITY,
	sunTempFactor: DEFAULT_SUN_TEMP_FACTOR,
	daysPerYear: DEFAULT_DAYS_PER_YEAR,
	hoursPerDay: DEFAULT_HOURS_PER_DAY,
	terrainWarp: 0.75,
	smoothing: 0.1,
	hydraulicErosion: 0.5,
	thermalErosion: 0.1,
	ridgeSharpening: 0.5,
	glacialErosion: 0.5,
	volcanism: 0.5,
	craters: 0,
	tectonicMode: 0,
	pressure: 1.0,
	antistellarLon: DEFAULT_ANTISTELLAR_LON,
	perihelion: DEFAULT_PERIHELION,
} as const

/** Terrain defaults for stagnant lid mode — overrides only the params that differ */
export const STAGNANT_TERRAIN_OVERRIDES = {
	roughness: 0.35,
	terrainWarp: 0.5,
	smoothing: 0.2,
	hydraulicErosion: 0.25,
	thermalErosion: 0.15,
	ridgeSharpening: 0.15,
	glacialErosion: 0.25,
	volcanism: 0.6,
	craters: 0.25,
} as const
