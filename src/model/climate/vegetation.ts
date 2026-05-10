/**
 * Vegetation and climate zone assignment for the orogen pipeline.
 * Classifies each land cell into a biome and climate zone based on temperature
 * and rainfall, mirroring the logic from src/model/shapers/climate.ts.
 */
import type { OrogenClimate, OrogenRainfall, SphereMesh } from ".."

/**
 * Climate zone codes stored in a Uint8Array:
 *   0 = ocean
 *   1 = arctic
 *   2 = subarctic
 *   3 = boreal
 *   4 = temperate (cool + warm)
 *   5 = subtropical
 *   6 = tropical
 *   7 = infernal
 *   8 = chaotic
 */
export const CLIMATE_LABELS = [
	"ocean",
	"arctic",
	"subarctic",
	"boreal",
	"temperate",
	"subtropical",
	"tropical",
	"infernal",
	"chaotic",
] as const

export const TEMPERATURE_BOUNDARY_SUBARCTIC = -14
export const TEMPERATURE_BOUNDARY_BOREAL = -6
export const TEMPERATURE_BOUNDARY_TEMPERATE = 6
export const TEMPERATURE_BOUNDARY_SUBTROPICAL = 16
export const TEMPERATURE_BOUNDARY_TROPICAL = 24

// Chaotic thresholds (from EBM constants)
export const CHAOTIC_MIN = 0
export const CHAOTIC_MAX = 40

/**
 * Assign a climate zone to each land cell based on temperature.
 */
export function assignClimateZones(
	mesh: SphereMesh,
	isLand: Uint8Array,
	climate: OrogenClimate,
): Uint8Array {
	const N = mesh.numRegions
	const zones = new Uint8Array(N) // 0 = ocean by default

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue

		const avg = climate.temperature_avg[r]
		const min = climate.temperature_min[r]
		const max = climate.temperature_max[r]

		const isChaotic = min < CHAOTIC_MIN && max > CHAOTIC_MAX
		const isInfernal = avg > CHAOTIC_MAX

		if (isChaotic) zones[r] = 8
		else if (isInfernal) zones[r] = 7
		else if (avg > TEMPERATURE_BOUNDARY_TROPICAL)
			zones[r] = 6 // tropical
		else if (avg > TEMPERATURE_BOUNDARY_SUBTROPICAL)
			zones[r] = 5 // subtropical
		else if (avg > TEMPERATURE_BOUNDARY_TEMPERATE)
			zones[r] = 4 // temperate (warm + cool)
		else if (avg > TEMPERATURE_BOUNDARY_BOREAL)
			zones[r] = 3 // boreal
		else if (avg > TEMPERATURE_BOUNDARY_SUBARCTIC)
			zones[r] = 2 // subarctic
		else zones[r] = 1 // arctic
	}

	return zones
}

/**
 * Biome codes stored in a Uint8Array:
 *   0 = ocean (no vegetation)
 *   1 = desert
 *   2 = sparse
 *   3 = grasslands
 *   4 = woods
 *   5 = forest
 *   6 = jungle
 */
export const BIOME_LABELS = [
	"ocean",
	"desert",
	"sparse",
	"grasslands",
	"woods",
	"forest",
	"jungle",
] as const
type BiomeCode = 0 | 1 | 2 | 3 | 4 | 5 | 6

// Rain thresholds (annual mm) — derived from the existing humidity scale
const ARID_RAINFALL_THRESHOLD = 100
const DRY = 250
const LOW = 500
const MOD = 900
const MOIST = 1500
const WET = 2200

/**
 * Half-width (mm) of the probabilistic blend zone around each rainfall threshold.
 * Within [threshold − HALF_WIDTH, threshold + HALF_WIDTH] the transition is
 * linear-probabilistic; outside that window the result is deterministic.
 */
export const RAINFALL_BLEND_HALF_WIDTH = 50

/**
 * Returns true if `rain` is considered to exceed `threshold`, with a linear
 * probabilistic blend in the ±RAINFALL_BLEND_HALF_WIDTH window around it.
 */
function probAbove(
	rain: number,
	threshold: number,
	rng: () => number,
): boolean {
	if (rain >= threshold + RAINFALL_BLEND_HALF_WIDTH) return true
	if (rain <= threshold - RAINFALL_BLEND_HALF_WIDTH) return false
	const t =
		(rain - (threshold - RAINFALL_BLEND_HALF_WIDTH)) /
		(2 * RAINFALL_BLEND_HALF_WIDTH)
	return rng() < t
}

/**
 * Assign a biome to each land cell based on temperature zone and annual rainfall.
 * Pass a seeded `rng` to produce deterministic probabilistic transitions near
 * rainfall boundaries.
 */
export function assignVegetation(
	mesh: SphereMesh,
	isLand: Uint8Array,
	climate: OrogenClimate,
	rainfall: OrogenRainfall,
	rng: () => number,
): Uint8Array {
	const N = mesh.numRegions
	const biome = new Uint8Array(N) // 0 = ocean by default

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue // ocean

		const temp = climate.temperature_avg[r]
		const rain = rainfall.annual[r]

		biome[r] = classifyBiome(temp, rain, rng)
	}

	return biome
}

function classifyBiome(
	temp: number,
	rain: number,
	rng: () => number,
): BiomeCode {
	// Arctic / ice cap
	if (temp <= TEMPERATURE_BOUNDARY_SUBARCTIC) return 1 // desert (ice desert)

	// Subarctic
	if (temp <= TEMPERATURE_BOUNDARY_BOREAL) {
		if (probAbove(rain, DRY, rng)) return 2 // sparse
		return 1 // desert
	}

	// Boreal
	if (temp <= TEMPERATURE_BOUNDARY_TEMPERATE) {
		if (probAbove(rain, MOD, rng)) return 5 // forest (taiga)
		if (probAbove(rain, LOW, rng)) return 4 // woods
		if (probAbove(rain, DRY, rng)) return 3 // grasslands
		if (probAbove(rain, ARID_RAINFALL_THRESHOLD, rng)) return 2 // sparse
		return 1 // desert
	}

	// Temperate
	if (temp <= TEMPERATURE_BOUNDARY_SUBTROPICAL) {
		if (probAbove(rain, MOD, rng)) return 5 // forest
		if (probAbove(rain, LOW, rng)) return 4 // woods
		if (probAbove(rain, DRY, rng)) return 3 // grasslands
		if (probAbove(rain, ARID_RAINFALL_THRESHOLD, rng)) return 2 // sparse
		return 1 // desert
	}

	// Subtropical
	if (temp <= TEMPERATURE_BOUNDARY_TROPICAL) {
		if (probAbove(rain, WET, rng)) return 6 // jungle
		if (probAbove(rain, MOD, rng)) return 5 // forest
		if (probAbove(rain, LOW, rng)) return 4 // woods
		if (probAbove(rain, DRY, rng)) return 3 // grasslands
		if (probAbove(rain, ARID_RAINFALL_THRESHOLD, rng)) return 2 // sparse
		return 1 // desert
	}

	// Tropical
	if (probAbove(rain, MOIST, rng)) return 6 // jungle
	if (probAbove(rain, MOD, rng)) return 5 // forest
	if (probAbove(rain, LOW, rng)) return 4 // woods
	if (probAbove(rain, DRY, rng)) return 3 // grasslands
	if (probAbove(rain, ARID_RAINFALL_THRESHOLD, rng)) return 2 // sparse
	return 1 // desert
}
