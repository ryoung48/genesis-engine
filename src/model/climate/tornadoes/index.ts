import { RAIN } from "@/model/climate/rain"
import type { ComputeTornadoRiskParams } from "@/model/climate/tornadoes/types"
import {
	TOPO_FLAT,
	TOPO_HILL,
	TOPO_LAKE,
	TOPO_MARSH,
	TOPO_MOUNTAIN,
	TOPO_OCEAN,
	TOPO_PLATEAU,
} from "@/model/terrain"
import { MATH } from "@/model/shared/math"

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
		case TOPO_FLAT:
			return 1.0
		case TOPO_MARSH:
			return 0.9
		case TOPO_PLATEAU:
			return 0.75
		case TOPO_HILL:
			return 0.5
		case TOPO_MOUNTAIN:
			return 0.1
		default:
			return 0.0 // ocean / lake
	}
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
	params,
}: ComputeTornadoRiskParams): Float32Array {
	const N = mesh.numRegions

	// No Coriolis on locked planets → no organized rotation → no tornadoes
	if (params.tideLock?.type === "solar") return new Float32Array(N)

	const hoursPerDay = params.hoursPerDay ?? 24
	const hw = RAIN.hadleyWidth(hoursPerDay)

	// The Ferrel cell spans [hw, 2*hw] from the thermal equator. When its outer
	// edge (2*hw) reaches or exceeds the pole (90°), the cell has collapsed →
	// no frontal shear zone → no tornadoes.
	if (hw * 2 >= 90) return new Float32Array(N)

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

	// --- Ferrel cell latitude band (fully relative to hw) ---
	const ferrelInner = hw
	const ferrelOuter = hw * 2
	const ferrelWidth = ferrelOuter - ferrelInner // always = hw
	const transIn = ferrelWidth * 0.25
	const transOut = ferrelWidth * 0.25

	const { latDeg, regionBin } = RAIN.getClimateGeometry(mesh)
	const annualTEQ = RAIN.computeThermalEquator({ mesh, temps: temperatureAvg })

	// --- Per-cell scoring ---
	const risk = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		// Only score land cells that have defined topography
		const topo = topography[r]
		if (topo === TOPO_OCEAN || topo === TOPO_LAKE) continue

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

		// d. Ferrel cell latitude factor — all thresholds relative to hw
		const teq = annualTEQ[regionBin[r]]
		const distFromTeq = Math.abs(latDeg[r] - teq)
		const latFactor =
			MATH.smoothstep({
				edge0: ferrelInner,
				edge1: ferrelInner + transIn,
				x: distFromTeq,
			}) *
			(1 -
				MATH.smoothstep({
					edge0: ferrelOuter - transOut,
					edge1: ferrelOuter + transOut * 0.5,
					x: distFromTeq,
				}))

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

	// biome-ignore lint/nursery/useMaxParams: native sort callback
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
