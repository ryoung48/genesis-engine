import { RAIN } from "@/model/climate/precipitation/rain"
import type {
	ComputeTornadoRiskParams,
	StormBeltFactorParams,
} from "@/model/climate/weather/tornadoes/types"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { MATH } from "@/model/shared/math/core"

function vegetationMoistureScore(biomeCode: number): number {
	switch (biomeCode) {
		case 1:
			return 0.05 // desert — too dry
		case 2:
			return 0.4 // sparse
		case 3:
			return 1.0 // grasslands — tornado alley archetype
		case 4:
			return 0.85 // woods
		case 5:
			return 0.45 // forest — too cloudy, suppresses surface heating
		case 6:
			return 0.1 // jungle — tropical, wrong latitude anyway
		default:
			return 0.0
	}
}

function terrainFactor(topoCode: number): number {
	switch (topoCode) {
		case CLASSIFICATION.topoFlat:
			return 1.0
		case CLASSIFICATION.topoMarsh:
			return 0.9
		case CLASSIFICATION.topoPlateau:
			return 0.75
		case CLASSIFICATION.topoHill:
			return 0.5
		case CLASSIFICATION.topoMountain:
			return 0.1
		default:
			return 0.0 // ocean / lake
	}
}

function stormBeltFactor({ lat, belts }: StormBeltFactorParams): number {
	let best = 0
	for (const belt of belts) {
		const north = lat >= 0
		const inner = north ? belt.hiN : -belt.hiS
		const width = north ? belt.loN - belt.hiN : belt.hiS - belt.loS
		if (width <= 0) continue
		const dist = Math.abs(lat)
		const factor =
			MATH.smoothstep({
				edge0: inner,
				edge1: inner + width * 0.25,
				x: dist,
			}) *
			(1 -
				MATH.smoothstep({
					edge0: inner + width * 0.75,
					edge1: inner + width * 1.125,
					x: dist,
				}))
		if (factor > best) best = factor
	}
	return best
}

function computeTornadoRisk({
	mesh,
	temperatureAvg,
	temperatureMax,
	temperatureMin,
	isLand,
	topography,
	vegetation,
	oceanDist,
	circulation,
}: ComputeTornadoRiskParams): Float32Array {
	const N = mesh.numRegions

	// No Coriolis on locked planets → no organized rotation → no tornadoes
	if (!circulation) return new Float32Array(N)

	// --- Global temperature statistics (used for relative thresholds) ---
	let globalTempSum = 0
	let globalRangeSum = 0
	let landCount = 0
	for (let r = 0; r < N; r++) {
		globalTempSum += temperatureAvg[r]
		if (isLand[r]) {
			globalRangeSum += temperatureMax[r] - temperatureMin[r]
			landCount++
		}
	}
	const globalMean = globalTempSum / N
	const globalMeanRange = landCount > 0 ? globalRangeSum / landCount : 30

	const { latDeg } = RAIN.getClimateGeometry(mesh)

	// --- Per-cell scoring ---
	const risk = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		// Only score land cells that have defined topography
		const topo = topography[r]
		if (topo === CLASSIFICATION.topoOcean || topo === CLASSIFICATION.topoLake)
			continue

		// a. Seasonal temperature range — high range = continental = strong fronts
		const annualRange = temperatureMax[r] - temperatureMin[r]
		const rangeScore = MATH.smoothstep({
			edge0: globalMeanRange * 0.4,
			edge1: globalMeanRange * 1.5,
			x: annualRange,
		})

		// b. Summer surface heating — proxy for low-level CAPE
		//    Scales relative to global mean so hot and cold planets behave correctly
		const heatScore = MATH.clamp({
			value: (temperatureMax[r] - globalMean - 5) / 12,
			lo: 0,
			hi: 1,
		})

		// c. Moisture via vegetation biome
		const moistureScore = vegetationMoistureScore(vegetation[r])

		// d. Mid-latitude storm belt: v2's Ferrel band (hiN→loN / hiS→loS),
		//    best of the twelve months so seasonal belt migration counts
		const latFactor = stormBeltFactor({
			lat: latDeg[r],
			belts: circulation.belts,
		})

		if (latFactor <= 0) continue

		// e. Terrain — flat plains favour long-track supercells
		const topoFactor = terrainFactor(topo)
		if (topoFactor <= 0) continue

		// f. Continental position — sweet spot ~400 km from ocean
		//    Coastal = uniform maritime air; deep interior = too dry
		const contFactor = MATH.piecewise({
			domain: [0, 50, 400, 1500, 4000],
			range: [0.1, 0.5, 1.0, 0.75, 0.45],
			x: oceanDist[r],
		})

		risk[r] =
			rangeScore *
			heatScore *
			moistureScore *
			latFactor *
			topoFactor *
			contFactor
	}

	// --- Normalise to [0, 1] at 99th percentile ---
	const nonZero: number[] = []
	for (let r = 0; r < N; r++) {
		if (risk[r] > 1e-5) nonZero.push(risk[r])
	}
	if (nonZero.length === 0) return risk

	nonZero.sort((a, b) => a - b)
	const p99 =
		nonZero[Math.min(nonZero.length - 1, Math.floor(0.99 * nonZero.length))]
	if (p99 <= 0) return risk

	const invP99 = 1 / p99
	for (let r = 0; r < N; r++) {
		risk[r] = Math.min(1, risk[r] * invP99)
	}
	return risk
}

export const TORNADOES = {
	computeTornadoRisk,
}
