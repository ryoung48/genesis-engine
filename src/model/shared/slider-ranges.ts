import { DEFAULT_PLANET_RADIUS_KM } from "./units"

type SliderRange = { min: number; max: number; step: number }

const RADIUS_MIN = Math.round((DEFAULT_PLANET_RADIUS_KM * 0.5) / 100) * 100
const RADIUS_MAX = Math.round((DEFAULT_PLANET_RADIUS_KM * 4) / 100) * 100

export const SLIDER_RANGES = {
	// terrain
	numPoints: { min: 5000, max: 2560000, step: 1000 },
	jitter: { min: 0, max: 1, step: 0.05 },
	numPlates: { min: 4, max: 120, step: 1 },
	roughness: { min: 0, max: 0.5, step: 0.01 },
	continentSizeVariety: { min: 0, max: 1, step: 0.05 },
	terrainWarp: { min: 0, max: 1, step: 0.05 },
	smoothing: { min: 0, max: 1, step: 0.05 },
	hydraulicErosion: { min: 0, max: 1, step: 0.05 },
	thermalErosion: { min: 0, max: 1, step: 0.05 },
	ridgeSharpening: { min: 0, max: 1, step: 0.05 },
	glacialErosion: { min: 0, max: 1, step: 0.05 },
	volcanism: { min: 0, max: 10, step: 0.05 },
	craters: { min: 0, max: 1, step: 0.05 },
	maxElevation: { min: 0, max: 30000, step: 100 },
	// planet
	planetRadiusKm: { min: RADIUS_MIN, max: RADIUS_MAX, step: 100 },
	sunTempFactor: { min: 0.6, max: 1.2, step: 0.01 },
	insolationFactor: { min: 0, max: 2, step: 0.01 },
	pressure: { min: 0.1, max: 100, step: 0.1 },
	obliquity: { min: 0, max: 180, step: 0.5 },
	eccentricity: { min: 0, max: 0.6, step: 0.001 },
	perihelion: { min: 0, max: 360, step: 1 },
	daysPerYear: { min: 100, max: 1460, step: 5 },
	hoursPerDay: { min: 6, max: 384, step: 6 },
	landDistribution: { min: 0, max: 1, step: 0.05 },
	landCoverage: { min: 0, max: 1, step: 0.01 },
	antistellarLon: { min: 0, max: 360, step: 1 },
} satisfies Record<string, SliderRange>
