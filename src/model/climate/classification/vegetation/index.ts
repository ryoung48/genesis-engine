import { PASTA } from "@/model/climate/classification/pasta"
import type {
	AssignClimateZonesParams,
	AssignEarthClimateZonesParams,
	AssignVegetationParams,
	BiomeCode,
} from "@/model/climate/classification/vegetation/types"

const climateLabels = [
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

const temperatureBoundarySubarctic = -14

const temperatureBoundaryBoreal = -6

const temperatureBoundaryTemperate = 6

const temperatureBoundarySubtropical = 16

const temperatureBoundaryTropical = 24

const chaoticMin = 10

const chaoticMax = 50

function assignClimateZones({
	mesh,
	isLand,
	temperatureAvg,
	temperatureMin,
	temperatureMax,
}: AssignClimateZonesParams): Uint8Array {
	const N = mesh.numRegions
	const zones = new Uint8Array(N) // 0 = ocean by default

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue

		const avg = temperatureAvg[r]
		const min = temperatureMin[r]
		const max = temperatureMax[r]

		const isChaotic = min < chaoticMin && max > chaoticMax
		const isInfernal = avg > chaoticMax

		if (isChaotic) zones[r] = 8
		else if (isInfernal) zones[r] = 7
		else if (avg > temperatureBoundaryTropical)
			zones[r] = 6 // tropical
		else if (avg > temperatureBoundarySubtropical)
			zones[r] = 5 // subtropical
		else if (avg > temperatureBoundaryTemperate)
			zones[r] = 4 // temperate (warm + cool)
		else if (avg > temperatureBoundaryBoreal)
			zones[r] = 3 // boreal
		else if (avg > temperatureBoundarySubarctic)
			zones[r] = 2 // subarctic
		else zones[r] = 1 // arctic
	}

	return zones
}

function assignEarthClimateZones({
	mesh,
	isLand,
	climate,
}: AssignEarthClimateZonesParams): Uint8Array | undefined {
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

	return assignClimateZones({
		mesh,
		isLand,
		temperatureAvg: avg,
		temperatureMin: min,
		temperatureMax: max,
	})
}

const biomeLabels = [
	"ocean",
	"desert",
	"sparse",
	"grasslands",
	"woods",
	"forest",
	"jungle",
] as const
const ARID_RAINFALL_THRESHOLD = 100

const DRY = 250

const LOW = 500

const MOD = 900

const MOIST = 1500

const WET = 2200

const RAINFALL_BLEND_HALF_WIDTH = 50

function probAbove({
	rain,
	threshold,
	rng,
}: {
	rain: number
	threshold: number
	rng: () => number
}): boolean {
	if (rain >= threshold + RAINFALL_BLEND_HALF_WIDTH) return true
	if (rain <= threshold - RAINFALL_BLEND_HALF_WIDTH) return false
	const t =
		(rain - (threshold - RAINFALL_BLEND_HALF_WIDTH)) /
		(2 * RAINFALL_BLEND_HALF_WIDTH)
	return rng() < t
}

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

function assignVegetation({
	mesh,
	isLand,
	climate,
	rainfall,
	rng,
	pastaZones,
	gdd,
	gar,
}: AssignVegetationParams): Uint8Array {
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
			const zoneLabel = PASTA.pastaLabels[pastaZones[r]]
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
			biome[r] = classifyBiome({ temp, rain, rng })
		}
	}

	return biome
}

function classifyBiome({
	temp,
	rain,
	rng,
}: {
	temp: number
	rain: number
	rng: () => number
}): BiomeCode {
	// Arctic / ice cap
	if (temp <= temperatureBoundarySubarctic) return 1 // desert (ice desert)

	// Subarctic
	if (temp <= temperatureBoundaryBoreal) {
		if (probAbove({ rain, threshold: DRY, rng })) return 2 // sparse
		return 1 // desert
	}

	// Boreal
	if (temp <= temperatureBoundaryTemperate) {
		if (probAbove({ rain, threshold: MOD, rng })) return 5 // forest (taiga)
		if (probAbove({ rain, threshold: LOW, rng })) return 4 // woods
		if (probAbove({ rain, threshold: DRY, rng })) return 3 // grasslands
		if (probAbove({ rain, threshold: ARID_RAINFALL_THRESHOLD, rng })) return 2 // sparse
		return 1 // desert
	}

	// Temperate
	if (temp <= temperatureBoundarySubtropical) {
		if (probAbove({ rain, threshold: MOD, rng })) return 5 // forest
		if (probAbove({ rain, threshold: LOW, rng })) return 4 // woods
		if (probAbove({ rain, threshold: DRY, rng })) return 3 // grasslands
		if (probAbove({ rain, threshold: ARID_RAINFALL_THRESHOLD, rng })) return 2 // sparse
		return 1 // desert
	}

	// Subtropical
	if (temp <= temperatureBoundaryTropical) {
		if (probAbove({ rain, threshold: WET, rng })) return 6 // jungle
		if (probAbove({ rain, threshold: MOD, rng })) return 5 // forest
		if (probAbove({ rain, threshold: LOW, rng })) return 4 // woods
		if (probAbove({ rain, threshold: DRY, rng })) return 3 // grasslands
		if (probAbove({ rain, threshold: ARID_RAINFALL_THRESHOLD, rng })) return 2 // sparse
		return 1 // desert
	}

	// Tropical
	if (probAbove({ rain, threshold: MOIST, rng })) return 6 // jungle
	if (probAbove({ rain, threshold: MOD, rng })) return 5 // forest
	if (probAbove({ rain, threshold: LOW, rng })) return 4 // woods
	if (probAbove({ rain, threshold: DRY, rng })) return 3 // grasslands
	if (probAbove({ rain, threshold: ARID_RAINFALL_THRESHOLD, rng })) return 2 // sparse
	return 1 // desert
}

export const VEGETATION = {
	climateLabels,
	temperatureBoundarySubarctic,
	temperatureBoundaryBoreal,
	temperatureBoundaryTemperate,
	temperatureBoundarySubtropical,
	temperatureBoundaryTropical,
	chaoticMin,
	chaoticMax,
	biomeLabels,
	assignClimateZones,
	assignEarthClimateZones,
	assignVegetation,
}
