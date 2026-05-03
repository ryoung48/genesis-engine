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
 * Assign a biome to each land cell based on temperature zone and annual rainfall.
 * Deterministic — no RNG needed.
 */
export function assignVegetation(
	mesh: SphereMesh,
	isLand: Uint8Array,
	climate: OrogenClimate,
	rainfall: OrogenRainfall,
): Uint8Array {
	const N = mesh.numRegions
	const biome = new Uint8Array(N) // 0 = ocean by default

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue // ocean

		const temp = climate.temperature_avg[r]
		const rain = rainfall.annual[r]

		biome[r] = classifyBiome(temp, rain)
	}

	return biome
}

function classifyBiome(temp: number, rain: number): BiomeCode {
	// Arctic / ice cap
	if (temp <= TEMPERATURE_BOUNDARY_SUBARCTIC) return 1 // desert (ice desert)

	// Subarctic
	if (temp <= TEMPERATURE_BOUNDARY_BOREAL) {
		if (rain > LOW) return 2 // sparse tundra
		if (rain > DRY) return 2 // sparse
		return 1 // desert
	}

	// Boreal
	if (temp <= TEMPERATURE_BOUNDARY_TEMPERATE) {
		if (rain > MOD) return 5 // forest (taiga)
		if (rain > LOW) return 4 // woods
		if (rain > DRY) return 3 // grasslands
		if (rain > ARID_RAINFALL_THRESHOLD) return 2 // sparse
		return 1 // desert
	}

	// Temperate
	if (temp <= TEMPERATURE_BOUNDARY_SUBTROPICAL) {
		if (rain > MOIST) return 5 // forest
		if (rain > MOD) return 5 // forest
		if (rain > LOW) return 4 // woods
		if (rain > DRY) return 3 // grasslands
		if (rain > ARID_RAINFALL_THRESHOLD) return 2 // sparse
		return 1 // desert
	}

	// Subtropical
	if (temp <= TEMPERATURE_BOUNDARY_TROPICAL) {
		if (rain > WET) return 6 // jungle
		if (rain > MOIST) return 5 // forest
		if (rain > MOD) return 5 // forest
		if (rain > LOW) return 4 // woods
		if (rain > DRY) return 3 // grasslands
		if (rain > ARID_RAINFALL_THRESHOLD) return 2 // sparse
		return 1 // desert
	}

	// Tropical
	if (rain > WET) return 6 // jungle
	if (rain > MOIST) return 6 // jungle
	if (rain > MOD) return 5 // forest
	if (rain > LOW) return 4 // woods
	if (rain > DRY) return 3 // grasslands
	if (rain > ARID_RAINFALL_THRESHOLD) return 2 // sparse
	return 1 // desert
}
