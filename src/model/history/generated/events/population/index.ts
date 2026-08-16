import { EVENT_HEAP } from "@/model/history/generated/event-heap"
import type {
	DevelopmentParams,
	HierarchyDepthParams,
	InitPopulationParams,
	NationProfile,
	RankSizeCitiesParams,
	RunPopulationParams,
	UrbanizationParams,
} from "@/model/history/generated/events/population/types"
import { FIELDS } from "@/model/history/generated/fields"
import { STATE } from "@/model/history/generated/state"
import { MATH } from "@/model/shared/math/core"
import { ERAS } from "@/model/society/eras"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import type { GovernmentType } from "@/model/society/types"

const MAX_ADJUSTMENT_RATE = 0.005

const URBAN_GROWTH = 0.1
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

	// republic — coastal oligarchy through modern mass-urban democracy
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

const TAU = 5_000

function rankSizeCities({ urbanPop, q }: RankSizeCitiesParams): number[] {
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

function urbanPopToDev(pop: number): number {
	return MATH.piecewise({
		domain: [1_000, 5_000, 20_000, 100_000, 1_000_000],
		range: [0.05, 0.1, 0.25, 0.65, 0.95],
		x: pop,
	})
}

function devToGrowthRate(dev: number): number {
	return MATH.piecewise({
		domain: [0.0, 0.15, 0.35, 0.55, 0.75, 0.95],
		range: [0.0005, 0.001, 0.0015, 0.002, 0.0025, 0.002],
		x: dev,
	})
}

function hierarchyDepth({ state, province }: HierarchyDepthParams): number {
	let depth = 0
	let current = province
	while (state.parentCurrent[current] >= 0) {
		current = state.parentCurrent[current]
		depth++
	}
	return depth
}

function urbanization({ state, init }: UrbanizationParams): void {
	// Process each sovereign nation
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p] || !STATE.isSovereign({ state, p })) continue

		const provinces = STATE.getNationProvinces({ state, root: p })
		let totalPop = 0
		for (const prov of provinces) {
			totalPop +=
				FIELDS.prov.population.rural.get({ state, p: prov }) +
				FIELDS.prov.population.urban.get({ state, p: prov })
		}

		const { U, q } = nationProfile(state.governmentType[p])
		const urbanPop = totalPop * U

		// Sort provinces by hierarchy depth ascending (sovereign = 0 gets the capital city),
		// breaking ties by habitability so deeper-ranked provinces still differ meaningfully.
		const sorted = provinces.slice().sort((a, b) => {
			const da = hierarchyDepth({ state, province: a })
			const db = hierarchyDepth({ state, province: b })
			if (da !== db) return da - db
			return state.habitability[b] - state.habitability[a]
		})

		// Rank-size hierarchy: N settlements whose sizes sum to exactly urbanPop.
		let sizes = rankSizeCities({ urbanPop, q })
		if (sizes.length > sorted.length) sizes = sizes.slice(0, sorted.length)

		for (let idx = 0; idx < sorted.length; idx++) {
			const prov = sorted[idx]
			state.leaderRuntime.targetUrban[prov] = sizes[idx] ?? 0
			if (init) {
				FIELDS.prov.population.urban.set({
					state,
					p: prov,
					time: state.time,
					value: state.leaderRuntime.targetUrban[prov],
				})
			}
		}
	}
}

const MAX_SPREAD_HOPS = 20

function development({ state, init }: DevelopmentParams): void {
	const { cityMin } = SETTLEMENT_TUNING.getSettlementEraTuning(state.era)
	const BASE_DECAY = 0.75
	const FOREIGN_DECAY = 0.65
	const WATER_ACCESS_BONUS = 1.1

	// Gather all cities
	const cities: { province: number; dev: number; sourceNation: number }[] = []
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		if (FIELDS.prov.population.urban.get({ state, p }) >= cityMin) {
			cities.push({
				province: p,
				dev: urbanPopToDev(FIELDS.prov.population.urban.get({ state, p })),
				sourceNation: STATE.getSovereign({ state, p }),
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

		const neighbors = STATE.getProvinceNeighbors({ state, p: province })
		for (const nb of neighbors) {
			if (state.desolate[nb]) continue
			const nbNation = STATE.getSovereign({ state, p: nb })
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
		const localDev = urbanPopToDev(
			FIELDS.prov.population.urban.get({ state, p }),
		)
		const targetDev = Math.max(cityDev, localDev)

		if (init) {
			FIELDS.prov.development.set({
				state,
				p,
				time: state.time,
				value: targetDev,
			})
		} else {
			const currentDev = FIELDS.prov.development.get({ state, p })
			const gap = targetDev - currentDev
			const rate = gap > 0 ? DEV_RISE : DEV_FALL
			FIELDS.prov.development.set({
				state,
				p,
				time: state.time,
				value: currentDev + gap * rate,
			})
		}
	}
}

function initPopulation({ state }: InitPopulationParams): void {
	urbanization({ state, init: true })
	development({ state, init: true })
	state.heap.enqueue(
		state.time + STATE.yearMs,
		EVENT_HEAP.evt.CENSUS,
		0,
		0,
		0,
		0,
		state.time,
	)
}

function runPopulation({ state, previousTime }: RunPopulationParams): void {
	const duration = state.time - previousTime
	const yearFraction = duration / STATE.yearMs

	urbanization({ state, init: false })
	development({ state, init: false })

	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue

		const growth =
			1 +
			devToGrowthRate(FIELDS.prov.development.get({ state, p })) * yearFraction
		const rural = FIELDS.prov.population.rural.get({ state, p })
		FIELDS.prov.population.rural.set({
			state,
			p,
			time: state.time,
			value: rural * growth,
		})

		const urban = FIELDS.prov.population.urban.get({ state, p })
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

		FIELDS.prov.population.urban.set({
			state,
			p,
			time: state.time,
			value: finalPop,
		})
	}

	// Schedule next census
	state.heap.enqueue(
		state.time + STATE.yearMs,
		EVENT_HEAP.evt.CENSUS,
		0,
		0,
		0,
		0,
		state.time,
	)
}

export const POPULATION = {
	initPopulation,
	runPopulation,
}
