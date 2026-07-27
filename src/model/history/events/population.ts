import { EVT } from "@/model/history/event-heap"
import { PROV } from "@/model/history/fields"
import type { HistoryRng } from "@/model/history/history-rng"
import {
	getNationProvinces,
	getProvinceNeighbors,
	getSovereign,
	type HistoryState,
	isSovereign,
	YEAR_MS,
} from "@/model/history/state"
import { ERAS } from "@/model/society/eras"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import type { GovernmentType } from "@/model/society/types"

const MAX_ADJUSTMENT_RATE = 0.005
const URBAN_GROWTH = 0.1

// 1444 Urban Demographics Ruleset (two-input edition): each government type
// carries its own urbanization share (U) and rank-size steepness (q).
interface NationProfile {
	U: number
	q: number
}

const GOVERNMENT_PROFILES: Record<GovernmentType, NationProfile> = {
	// tribal — negligible true urbanization, flat-to-moderate hierarchy
	chiefdom: { U: 0.015, q: 0.9 }, // single hereditary seat, no real hierarchy
	tribal_monarchy: { U: 0.025, q: 1.0 }, // one organised royal seat
	tribal_federation: { U: 0.03, q: 0.75 }, // multi-tribe council, several similar centers
	native_council: { U: 0.015, q: 0.8 }, // small frontier council, flat and sparse
	steppe_horde: { U: 0.01, q: 0.6 }, // nomadic, no fixed urban seat, very flat

	// monarchy — decentralised feudal through centralised absolutist to modern constitutional
	feudal_monarchy: { U: 0.05, q: 0.85 }, // many small towns, few large cities
	elective_monarchy: { U: 0.07, q: 0.8 }, // elected king over autonomous nobility, flat
	absolute_monarchy: { U: 0.12, q: 1.2 }, // centralised crown, dominant capital
	constitutional_monarchy: { U: 0.25, q: 1.0 }, // modern urbanization, moderate primacy
	dynastic_signoria: { U: 0.3, q: 1.3 }, // one dominant princely city (Florence, Milan)
	warlord_state: { U: 0.1, q: 0.85 }, // fragmented garrison towns, weak primacy
	shogunate: { U: 0.15, q: 1.15 }, // institutionalized military capital, strong primacy
	bureaucratic_monarchy: { U: 0.18, q: 1.15 }, // imperial capital plus provincial admin cities

	// republic — coastal oligarchy through modern mass-urban democracy
	merchant_republic: { U: 0.35, q: 1.3 }, // trade oligarchy, one dominant port capital
	oligarchic_republic: { U: 0.2, q: 1.1 }, // aristocratic senate, strong core city
	free_city: { U: 0.5, q: 0.9 }, // self-governing city or loose league, mostly urban
	peasant_republic: { U: 0.04, q: 0.65 }, // lord-less free-peasant commune, rural and flat
	presidential_republic: { U: 0.4, q: 1.0 }, // industrial+ mass urbanization
	parliamentary_republic: { U: 0.4, q: 0.9 }, // industrial+, slightly less primacy
	pirate_republic: { U: 0.35, q: 1.0 }, // single small haven port

	// theocracy — sacred-capital hierarchies
	theocracy: { U: 0.08, q: 1.2 }, // one oversized holy city
	monastic_state: { U: 0.06, q: 1.3 }, // small, centralized around the mother house
	imperial_cult: { U: 0.1, q: 1.3 }, // large sacred-imperial capital, very steep

	// republic extensions — modern authoritarian/centralized states
	socialist_state: { U: 0.3, q: 1.15 }, // centrally planned, capital-heavy
	military_junta: { U: 0.25, q: 1.2 }, // garrison-state, capital-dominant
	fascist_state: { U: 0.32, q: 1.25 }, // mass-party propaganda capital, very centralized
	dictatorial_rule: { U: 0.28, q: 1.15 }, // personalist autocracy, less institutionalized than junta

	// colonial
	trading_company: { U: 0.3, q: 1.3 }, // chartered company rule, single dominant port
	settler_colony: { U: 0.15, q: 1.0 }, // sparse frontier settlement, moderate primacy
}

function nationProfile(governmentTypeIndex: number): NationProfile {
	const label = ERAS.governmentTypes[governmentTypeIndex]
	return label
		? GOVERNMENT_PROFILES[label]
		: GOVERNMENT_PROFILES.feudal_monarchy
}

/** Below this settlement size, population is rural/nomadic rather than a town. */
const TAU = 5_000

// Rank-size hierarchy: grow the settlement count N until the smallest
// settlement would fall below τ, then normalize sizes so they sum to urbanPop.
function rankSizeCities(urbanPop: number, q: number): number[] {
	let N = 0
	let H = 0
	for (;;) {
		const nextN = N + 1
		const nextH = H + nextN ** -q
		const smallest = (urbanPop * nextN ** -q) / nextH
		if (smallest < TAU) break
		N = nextN
		H = nextH
	}
	if (N === 0) return []
	return Array.from({ length: N }, (_, i) => (urbanPop * (i + 1) ** -q) / H)
}

// Piecewise linear interpolation across fixed domain/range points.
function lerpScale(domain: number[], range: number[], v: number): number {
	const clamped = Math.max(domain[0], Math.min(domain[domain.length - 1], v))
	for (let i = 0; i < domain.length - 1; i++) {
		if (clamped <= domain[i + 1]) {
			const t = (clamped - domain[i]) / (domain[i + 1] - domain[i])
			return range[i] + t * (range[i + 1] - range[i])
		}
	}
	return range[range.length - 1]
}

function urbanPopToDev(pop: number): number {
	return lerpScale(
		[1_000, 5_000, 20_000, 100_000, 1_000_000],
		[0.05, 0.1, 0.25, 0.65, 0.95],
		pop,
	)
}

function devToGrowthRate(dev: number): number {
	return lerpScale(
		[0.0, 0.15, 0.35, 0.55, 0.75, 0.95],
		[0.0005, 0.001, 0.0015, 0.002, 0.0025, 0.002],
		dev,
	)
}

function hierarchyDepth(state: HistoryState, province: number): number {
	let depth = 0
	let current = province
	while (state.parentCurrent[current] >= 0) {
		current = state.parentCurrent[current]
		depth++
	}
	return depth
}

function urbanization(state: HistoryState, init: boolean): void {
	// Process each sovereign nation
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p] || !isSovereign(state, p)) continue

		const provinces = getNationProvinces(state, p)
		let totalPop = 0
		for (const prov of provinces) {
			totalPop +=
				PROV.population.rural.get(state, prov) +
				PROV.population.urban.get(state, prov)
		}

		const { U, q } = nationProfile(state.governmentType[p])
		const urbanPop = totalPop * U

		// Sort provinces by hierarchy depth ascending (sovereign = 0 gets the capital city),
		// breaking ties by habitability so deeper-ranked provinces still differ meaningfully.
		const sorted = provinces.slice().sort((a, b) => {
			const da = hierarchyDepth(state, a)
			const db = hierarchyDepth(state, b)
			if (da !== db) return da - db
			return state.habitability[b] - state.habitability[a]
		})

		// Rank-size hierarchy: N settlements whose sizes sum to exactly urbanPop.
		let sizes = rankSizeCities(urbanPop, q)
		if (sizes.length > sorted.length) sizes = sizes.slice(0, sorted.length)

		for (let idx = 0; idx < sorted.length; idx++) {
			const prov = sorted[idx]
			state.leaderRuntime.targetUrban[prov] = sizes[idx] ?? 0
			if (init) {
				PROV.population.urban.set(
					state,
					prov,
					state.time,
					state.leaderRuntime.targetUrban[prov],
				)
			}
		}
	}
}

/** Max spread distance in province hops (simplified from km-based) */
const MAX_SPREAD_HOPS = 20

function development(state: HistoryState, init: boolean): void {
	const { cityMin } = SETTLEMENT_TUNING.getSettlementEraTuning(state.era)
	const BASE_DECAY = 0.75
	const FOREIGN_DECAY = 0.65
	const WATER_ACCESS_BONUS = 1.1

	// Gather all cities
	const cities: { province: number; dev: number; sourceNation: number }[] = []
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		if (PROV.population.urban.get(state, p) >= cityMin) {
			cities.push({
				province: p,
				dev: urbanPopToDev(PROV.population.urban.get(state, p)),
				sourceNation: getSovereign(state, p),
			})
		}
	}

	// Multi-source BFS from all cities
	const devFromCities = new Float32Array(state.P)
	const visited = new Uint8Array(state.P)
	// Priority queue approximation: process highest dev first using a sorted array
	const queue: {
		province: number
		dev: number
		sourceNation: number
		hops: number
	}[] = cities.map((c) => ({ ...c, hops: 0 })).sort((a, b) => b.dev - a.dev)

	for (const city of cities) {
		devFromCities[city.province] = city.dev
		visited[city.province] = 1
	}

	while (queue.length > 0) {
		const { province, dev, sourceNation, hops } = queue.shift()!
		if (dev < 0.01 || hops >= MAX_SPREAD_HOPS) continue

		const neighbors = getProvinceNeighbors(state, province)
		for (const nb of neighbors) {
			if (state.desolate[nb]) continue
			const nbNation = getSovereign(state, nb)
			const isForeign = nbNation !== sourceNation
			const hasWaterAccess = state.waterAccess[nb] === 1

			let decay = BASE_DECAY
			if (isForeign) decay = FOREIGN_DECAY
			if (hasWaterAccess) decay *= WATER_ACCESS_BONUS

			const spreadDev = dev * decay
			if (spreadDev < 0.01) continue
			if (devFromCities[nb] >= spreadDev) continue

			devFromCities[nb] = spreadDev

			// Insert maintaining sorted order
			let lo = 0
			let hi = queue.length
			while (lo < hi) {
				const mid = (lo + hi) >>> 1
				if (queue[mid].dev > spreadDev) lo = mid + 1
				else hi = mid
			}
			queue.splice(lo, 0, {
				province: nb,
				dev: spreadDev,
				sourceNation,
				hops: hops + 1,
			})
		}
	}

	// Apply development
	const DEV_RISE = 0.1
	const DEV_FALL = 0.05
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const cityDev = devFromCities[p]
		const localDev = urbanPopToDev(PROV.population.urban.get(state, p))
		const targetDev = Math.max(cityDev, localDev)

		if (init) {
			PROV.development.set(state, p, state.time, targetDev)
		} else {
			const currentDev = PROV.development.get(state, p)
			const gap = targetDev - currentDev
			const rate = gap > 0 ? DEV_RISE : DEV_FALL
			PROV.development.set(state, p, state.time, currentDev + gap * rate)
		}
	}
}

export function initPopulation(state: HistoryState, _rng: HistoryRng): void {
	urbanization(state, true)
	development(state, true)
	state.heap.enqueue(state.time + YEAR_MS, EVT.CENSUS, 0, 0, 0, 0, state.time)
}

export function runPopulation(
	state: HistoryState,
	previousTime: number,
	_rng: HistoryRng,
): void {
	const duration = state.time - previousTime
	const yearFraction = duration / YEAR_MS

	urbanization(state, false)
	development(state, false)

	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue

		const growth =
			1 + devToGrowthRate(PROV.development.get(state, p)) * yearFraction
		const rural = PROV.population.rural.get(state, p)
		PROV.population.rural.set(state, p, state.time, rural * growth)

		const urban = PROV.population.urban.get(state, p)
		const targetPop = state.leaderRuntime.targetUrban[p]
		const urbanGrowth = urban * growth
		const maxAdjustment = urbanGrowth * MAX_ADJUSTMENT_RATE * yearFraction

		let finalPop: number
		if (targetPop >= urbanGrowth) {
			const gap = targetPop - urbanGrowth
			const adjustment = Math.min(gap * URBAN_GROWTH, maxAdjustment)
			finalPop = Math.min(urbanGrowth + adjustment, targetPop)
		} else {
			const gap = urbanGrowth - targetPop
			const adjustment = Math.min(gap * URBAN_GROWTH, maxAdjustment)
			finalPop = Math.max(urbanGrowth - adjustment, targetPop)
		}

		PROV.population.urban.set(state, p, state.time, finalPop)
	}

	// Schedule next census
	state.heap.enqueue(state.time + YEAR_MS, EVT.CENSUS, 0, 0, 0, 0, state.time)
}
