/**
 * Vegetation and climate zone assignment for the genesis pipeline.
 * Classifies each land cell into a biome and climate zone based on temperature
 * and rainfall, mirroring the logic from src/model/shaders/climate.ts.
 */
import type { GenesisClimate, GenesisRainfall, SphereMesh } from ".."
import { PASTA_LABELS } from "./pasta"

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
export const CHAOTIC_MIN = 15
export const CHAOTIC_MAX = 40

/**
 * Assign a climate zone to each land cell based on temperature. Takes raw
 * avg/min/max arrays (rather than a GenesisClimate object) so the same
 * classifier can run on either procedural EBM temperature or observed-Earth
 * temperature — see assignEarthClimateZones.
 */
export function assignClimateZones(
	mesh: SphereMesh,
	isLand: Uint8Array,
	temperatureAvg: Float32Array,
	temperatureMin: Float32Array,
	temperatureMax: Float32Array,
): Uint8Array {
	const N = mesh.numRegions
	const zones = new Uint8Array(N) // 0 = ocean by default

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue

		const avg = temperatureAvg[r]
		const min = temperatureMin[r]
		const max = temperatureMax[r]

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
 * Observed-Earth counterpart to assignClimateZones. Derives avg/min/max from
 * climate.real_temperature_monthly instead of the procedural EBM output.
 * Returns undefined if no observed temperature is attached (procedural
 * worlds, or an Earth import that didn't supply a real climate raster).
 */
export function assignEarthClimateZones(
	mesh: SphereMesh,
	isLand: Uint8Array,
	climate: GenesisClimate,
): Uint8Array | undefined {
	const monthly = climate.real_temperature_monthly
	if (!monthly) return undefined

	const N = mesh.numRegions
	const avg = new Float32Array(N)
	const min = new Float32Array(N)
	const max = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let sum = 0
		let hot = -Infinity
		let cold = Infinity
		for (let m = 0; m < 12; m++) {
			const t = monthly[m * N + r]
			sum += t
			if (t > hot) hot = t
			if (t < cold) cold = t
		}
		avg[r] = sum / 12
		min[r] = cold
		max[r] = hot
	}

	return assignClimateZones(mesh, isLand, avg, min, max)
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
const RAINFALL_BLEND_HALF_WIDTH = 50

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

/** Mapping from Pasta zone label to base biome code. */
const PASTA_BIOME_MAP: Record<string, BiomeCode> = {
	// Arid
	Aha: 1,
	Ahc: 1,
	Ahh: 1,
	Ahe: 1,
	Ada: 2,
	Adc: 2,
	Adh: 2,
	Ade: 2,

	// Tropical
	TUr: 6,
	TUrp: 6,
	TUf: 5,
	TUfp: 6,
	TUs: 4,
	TUsp: 5,
	TUA: 3,
	TUAp: 4,

	TQf: 5,
	TQfp: 6,
	TQs: 4,
	TQsp: 5,
	TQA: 3,
	TQAp: 4,

	TF: 2,
	TG: 1,

	// Cold
	CTf: 5,
	CTfp: 6,
	CTs: 4,
	CTsp: 5,

	CDa: 5,
	CDap: 5,
	CDb: 5,
	CDbp: 5,

	CEa: 5,
	CEap: 5,
	CEb: 5,
	CEbp: 5,
	CEc: 5,
	CEcp: 5,

	CMa: 4,
	CMb: 4,

	CAMa: 4,
	CAMb: 4,
	CAa: 3,
	CAap: 4,
	CAb: 3,
	CAbp: 3,

	CFa: 2,
	CFb: 2,
	CG: 1,
	CI: 1,

	// Hot
	HTf: 5,
	HTfp: 5,
	HTs: 4,
	HTsp: 5,

	HDa: 4,
	HDap: 5,
	HDb: 3,
	HDbp: 4,
	HDc: 2,
	HDcp: 3,

	HMa: 4,
	HMb: 3,
	HMc: 2,

	HAMa: 3,
	HAMb: 2,
	HAMc: 1,
	HAa: 3,
	HAap: 4,
	HAb: 2,
	HAbp: 3,
	HAc: 1,
	HAcp: 2,

	HFa: 2,
	HFb: 2,
	HFc: 1,
	HG: 1,

	// Extraseasonal
	ETf: 5,
	ETfp: 6,
	ETs: 4,
	ETsp: 5,

	EDa: 5,
	EDap: 5,
	EDb: 5,
	EDbp: 5,

	EMa: 4,
	EMb: 4,

	EAMa: 4,
	EAMb: 4,
	EAa: 3,
	EAap: 4,
	EAb: 3,
	EAbp: 4,

	EFa: 2,
	EFb: 2,
	EG: 1,
}

/**
 * Assign a biome to each land cell based on the Pasta climate zone.
 * Uses the Pasta zone as the primary classifier, with probabilistic noise
 * at biome boundaries to preserve organic transitions.
 */
export function assignVegetation(
	mesh: SphereMesh,
	isLand: Uint8Array,
	climate: GenesisClimate,
	rainfall: GenesisRainfall,
	rng: () => number,
	pastaZones?: Uint8Array,
	gdd?: Float32Array,
	gar?: Float32Array,
): Uint8Array {
	const N = mesh.numRegions
	const biome = new Uint8Array(N) // 0 = ocean by default

	// Cold/extraseasonal forest zones that transition to woods at low GAr or low GDD
	const COLD_EXTRA_FORESTS = new Set([
		"CTf",
		"CTfp",
		"CDa",
		"CDap",
		"CDb",
		"CDbp",
		"CEa",
		"CEap",
		"CEb",
		"CEbp",
		"CEc",
		"CEcp",
		"ETf",
		"ETfp",
		"EDa",
		"EDap",
		"EDb",
		"EDbp",
	])
	const WOODS_CODE = 4 as BiomeCode
	const GRASS_CODE = 3 as BiomeCode

	const DRY_MEDITERRANEAN = new Set([
		"CAMa",
		"CAMb",
		"HAMa",
		"HAMb",
		"HAMc",
		"EAMa",
		"EAMb",
	])

	if (pastaZones) {
		const baseBiome = new Uint8Array(N)
		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			const zoneLabel = PASTA_LABELS[pastaZones[r]]
			let biomeCode = PASTA_BIOME_MAP[zoneLabel] ?? 1
			// Cold/extraseasonal forest → woods transition at GAr < 0.6 or GDD < 600
			if (biomeCode === 5 && COLD_EXTRA_FORESTS.has(zoneLabel)) {
				const lowGar = gar !== undefined && gar[r] < 0.75
				const lowGDD = gdd !== undefined && gdd[r] < 750
				if (gdd !== undefined && gdd[r] < 500) biomeCode = GRASS_CODE
				else if (lowGar || lowGDD) biomeCode = WOODS_CODE
			} else if (biomeCode === 4 && DRY_MEDITERRANEAN.has(zoneLabel)) {
				if (gar !== undefined && gar[r] < 0.1) biomeCode = GRASS_CODE
			}
			baseBiome[r] = biomeCode
		}

		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			biome[r] = baseBiome[r] as BiomeCode
		}
	} else {
		// Fallback: temperature + rainfall only (legacy behavior)
		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			const temp = climate.temperature_avg[r]
			const rain = rainfall.annual[r]
			biome[r] = classifyBiome(temp, rain, rng)
		}
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
