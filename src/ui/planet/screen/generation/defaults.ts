import { STAR } from "@/model/celestial/star"
import { SYSTEM } from "@/model/celestial/system"
import { ERAS } from "@/model/society/eras"

export const PLANET_SEED_STORAGE_KEY = "genesis:lastPlanetSeed"
export const VIEW_PREFS_STORAGE_KEY = "genesis:viewPrefs"
export const GENERATION_SESSION_STORAGE_KEY = "genesis:generationSession"

export const DEFAULT_WORLD_PARAMS = {
	numPoints: 204000,
	jitter: 0.75,
	numPlates: 80,
	landDistribution: 1 - SYSTEM.SOL_MAIN_WORLD_DEFAULTS.landConcentration,
	continentSizeVariety: 0.35,
	landCoverage: 0.3,
	roughness: 0.4,
	planetRadiusKm: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.planetRadiusKm,
	obliquity: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.obliquity,
	eccentricity: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.eccentricity,
	spectralClass: STAR.defaultSpectralClass,
	starSubtype: STAR.defaultStarSubtype,
	orbitalDistanceAU: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.orbitalDistanceAU,
	daysPerYear: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.daysPerYear,
	hoursPerDay: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.hoursPerDay,
	terrainWarp: 0.75,
	smoothing: 0.1,
	hydraulicErosion: 0.5,
	thermalErosion: 0.1,
	ridgeSharpening: 0.5,
	glacialErosion: 0.5,
	seaLevel: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.seaLevel,
	volcanism: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.volcanism,
	craters: 0,
	maxElevation: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.maxElevation,
	pressure: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.pressureBar,
	substellarLon: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.substellarLon,
	perihelion: SYSTEM.SOL_MAIN_WORLD_DEFAULTS.perihelion,
	era: ERAS.defaultEra,
} as const
