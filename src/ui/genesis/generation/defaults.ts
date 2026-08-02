import { STAR } from "@/model/celestial/star"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { ERAS } from "@/model/society/eras"

export const PLANET_SEED_STORAGE_KEY = "genesis:lastPlanetSeed"
export const VIEW_PREFS_STORAGE_KEY = "genesis:viewPrefs"
export const GENERATION_SESSION_STORAGE_KEY = "genesis:generationSession"

export const DEFAULT_WORLD_PARAMS = {
	numPoints: 204000,
	jitter: 0.75,
	numPlates: 80,
	landDistribution: 1 - SOL_SYSTEM.solMainWorldDefaults.landConcentration,
	continentSizeVariety: 0.35,
	landCoverage: 0.3,
	roughness: 0.4,
	planetRadiusKm: SOL_SYSTEM.solMainWorldDefaults.planetRadiusKm,
	obliquity: SOL_SYSTEM.solMainWorldDefaults.obliquity,
	eccentricity: SOL_SYSTEM.solMainWorldDefaults.eccentricity,
	spectralClass: STAR.defaultSpectralClass,
	starSubtype: STAR.defaultStarSubtype,
	orbitalDistanceAU: SOL_SYSTEM.solMainWorldDefaults.orbitalDistanceAU,
	daysPerYear: SOL_SYSTEM.solMainWorldDefaults.daysPerYear,
	hoursPerDay: SOL_SYSTEM.solMainWorldDefaults.hoursPerDay,
	pastaGintThreshold: 1250,
	terrainWarp: 0.75,
	smoothing: 0.1,
	hydraulicErosion: 0.5,
	thermalErosion: 0.1,
	ridgeSharpening: 0.5,
	glacialErosion: 0.5,
	seaLevel: SOL_SYSTEM.solMainWorldDefaults.seaLevel,
	volcanism: SOL_SYSTEM.solMainWorldDefaults.volcanism,
	craters: 0,
	maxElevation: SOL_SYSTEM.solMainWorldDefaults.maxElevation,
	pressure: SOL_SYSTEM.solMainWorldDefaults.pressureBar,
	substellarLon: SOL_SYSTEM.solMainWorldDefaults.substellarLon,
	perihelion: SOL_SYSTEM.solMainWorldDefaults.perihelion,
	era: ERAS.defaultEra,
} as const
