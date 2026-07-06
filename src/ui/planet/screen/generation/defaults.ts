import {
	DEFAULT_SPECTRAL_CLASS,
	DEFAULT_STAR_SUBTYPE,
} from "@/model/celestial/star/star-types"
import { SOL_MAIN_WORLD_DEFAULTS } from "@/model/celestial/system/sol-system"
import { DEFAULT_ERA } from "@/model/society/eras"

export const PLANET_CODE_STORAGE_KEY = "genesis:lastPlanetCode"
export const RECENT_CODES_STORAGE_KEY = "genesis:recentCodes"
export const STARRED_RECENT_CODES_STORAGE_KEY = "genesis:starredRecentCodes"
export const VIEW_PREFS_STORAGE_KEY = "genesis:viewPrefs"
export const GENERATION_SESSION_STORAGE_KEY = "genesis:generationSession"
export const MAX_RECENT_CODES = 10

export const DEFAULT_WORLD_PARAMS = {
	numPoints: 204000,
	jitter: 0.75,
	numPlates: 80,
	landDistribution: 1 - SOL_MAIN_WORLD_DEFAULTS.landConcentration,
	continentSizeVariety: 0.35,
	landCoverage: 0.3,
	roughness: 0.4,
	planetRadiusKm: SOL_MAIN_WORLD_DEFAULTS.planetRadiusKm,
	obliquity: SOL_MAIN_WORLD_DEFAULTS.obliquity,
	eccentricity: SOL_MAIN_WORLD_DEFAULTS.eccentricity,
	spectralClass: DEFAULT_SPECTRAL_CLASS,
	starSubtype: DEFAULT_STAR_SUBTYPE,
	orbitalDistanceAU: SOL_MAIN_WORLD_DEFAULTS.orbitalDistanceAU,
	daysPerYear: SOL_MAIN_WORLD_DEFAULTS.daysPerYear,
	hoursPerDay: SOL_MAIN_WORLD_DEFAULTS.hoursPerDay,
	terrainWarp: 0.75,
	smoothing: 0.1,
	hydraulicErosion: 0.5,
	thermalErosion: 0.1,
	ridgeSharpening: 0.5,
	glacialErosion: 0.5,
	seaLevel: SOL_MAIN_WORLD_DEFAULTS.seaLevel,
	volcanism: SOL_MAIN_WORLD_DEFAULTS.volcanism,
	craters: 0,
	maxElevation: SOL_MAIN_WORLD_DEFAULTS.maxElevation,
	pressure: SOL_MAIN_WORLD_DEFAULTS.pressureBar,
	antistellarLon: SOL_MAIN_WORLD_DEFAULTS.antistellarLon,
	perihelion: SOL_MAIN_WORLD_DEFAULTS.perihelion,
	era: DEFAULT_ERA,
	moonCount: SOL_MAIN_WORLD_DEFAULTS.moonCount,
} as const
