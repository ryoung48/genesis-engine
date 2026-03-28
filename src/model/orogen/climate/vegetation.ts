/**
 * Vegetation and climate zone assignment for the orogen pipeline.
 * Classifies each land cell into a biome and climate zone based on temperature
 * and rainfall, mirroring the logic from src/model/shapers/climate.ts.
 */
import type { SphereMesh, OrogenClimate, OrogenRainfall } from "../types"

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
export const CLIMATE_LABELS = ["ocean", "arctic", "subarctic", "boreal", "temperate", "subtropical", "tropical", "infernal", "chaotic"] as const
export type ClimateCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

// Chaotic thresholds (from EBM constants)
const CHAOTIC_MIN = 10
const CHAOTIC_MAX = 50

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

		// Compute monthly min/max for chaotic/infernal detection
		let minMonth = avg
		let maxMonth = avg
		for (let m = 0; m < 12; m++) {
			const t = climate.temperature_monthly[m * N + r]
			if (t < minMonth) minMonth = t
			if (t > maxMonth) maxMonth = t
		}

		const isChaotic = minMonth < CHAOTIC_MIN && maxMonth > CHAOTIC_MAX
		const isInfernal = avg > CHAOTIC_MAX

		if (isChaotic) zones[r] = 8
		else if (isInfernal) zones[r] = 7
		else if (avg > 24) zones[r] = 6   // tropical
		else if (avg > 16) zones[r] = 5   // subtropical
		else if (avg > 6) zones[r] = 4    // temperate (warm + cool)
		else if (avg > -3) zones[r] = 3   // boreal
		else if (avg > -9) zones[r] = 2   // subarctic
		else zones[r] = 1                 // arctic
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
export const BIOME_LABELS = ["ocean", "desert", "sparse", "grasslands", "woods", "forest", "jungle"] as const
export type BiomeCode = 0 | 1 | 2 | 3 | 4 | 5 | 6

// Rain thresholds (annual mm) — derived from the existing humidity scale
const ARID   = 100
const DRY    = 250
const LOW    = 500
const MOD    = 900
const MOIST  = 1500
const WET    = 2200

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
	if (temp <= -9) return 1 // desert (ice desert)

	// Subarctic
	if (temp <= -3) {
		if (rain > LOW) return 2     // sparse tundra
		if (rain > DRY) return 2     // sparse
		return 1                      // desert
	}

	// Boreal
	if (temp <= 6) {
		if (rain > MOD) return 5      // forest (taiga)
		if (rain > LOW) return 4      // woods
		if (rain > DRY) return 3      // grasslands
		if (rain > ARID) return 2     // sparse
		return 1                      // desert
	}

	// Cool temperate
	if (temp <= 12) {
		if (rain > MOIST) return 5    // forest
		if (rain > MOD) return 5      // forest
		if (rain > LOW) return 4      // woods
		if (rain > DRY) return 3      // grasslands
		if (rain > ARID) return 2     // sparse
		return 1                      // desert
	}

	// Warm temperate
	if (temp <= 18) {
		if (rain > WET) return 5      // forest
		if (rain > MOIST) return 5    // forest
		if (rain > MOD) return 4      // woods
		if (rain > LOW) return 4      // woods
		if (rain > DRY) return 3      // grasslands
		if (rain > ARID) return 2     // sparse
		return 1                      // desert
	}

	// Subtropical
	if (temp <= 24) {
		if (rain > WET) return 6      // jungle
		if (rain > MOIST) return 5    // forest
		if (rain > MOD) return 5      // forest
		if (rain > LOW) return 4      // woods
		if (rain > DRY) return 3      // grasslands
		if (rain > ARID) return 2     // sparse
		return 1                      // desert
	}

	// Tropical
	if (rain > WET) return 6          // jungle
	if (rain > MOIST) return 6        // jungle
	if (rain > MOD) return 5          // forest
	if (rain > LOW) return 4          // woods
	if (rain > DRY) return 3          // grasslands
	if (rain > ARID) return 2         // sparse
	return 1                          // desert
}
