import {
	DEFAULT_ANTISTELLAR_LON,
	DEFAULT_DAYS_PER_YEAR,
	DEFAULT_ECCENTRICITY,
	DEFAULT_HOURS_PER_DAY,
	DEFAULT_INSOLATION_FACTOR,
	DEFAULT_OBLIQUITY_DEG,
	DEFAULT_PERIHELION,
	DEFAULT_PLANET_RADIUS_KM,
	DEFAULT_SUN_TEMP_FACTOR,
} from "@/model/shared/units"
import { DEFAULT_ERA } from "@/model/society/eras"

export const PLANET_CODE_STORAGE_KEY = "genesis:lastPlanetCode"
export const RECENT_CODES_STORAGE_KEY = "genesis:recentCodes"
export const VIEW_PREFS_STORAGE_KEY = "genesis:viewPrefs"
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
	insolationFactor: DEFAULT_INSOLATION_FACTOR,
	daysPerYear: DEFAULT_DAYS_PER_YEAR,
	hoursPerDay: DEFAULT_HOURS_PER_DAY,
	terrainWarp: 0.75,
	smoothing: 0.1,
	hydraulicErosion: 0.5,
	thermalErosion: 0.1,
	ridgeSharpening: 0.5,
	glacialErosion: 0.5,
	seaLevel: 1,
	volcanism: 1,
	craters: 0,
	maxElevation: 6000,
	pressure: 1.0,
	antistellarLon: DEFAULT_ANTISTELLAR_LON,
	perihelion: DEFAULT_PERIHELION,
	era: DEFAULT_ERA,
	tidalStrength: 1.0,
} as const
