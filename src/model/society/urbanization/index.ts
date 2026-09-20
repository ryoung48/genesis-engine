import { MATH } from "@/model/shared/math/core"
import { DEJURE } from "@/model/society/dejure"
import { ERAS } from "@/model/society/eras"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import type { GovernmentType } from "@/model/society/types"
import type {
	ComputeDevelopmentParams,
	NationProfile,
	RankSizeCitiesParams,
	RankSizesForNationParams,
	SortByRankParams,
	SpreadDevelopmentParams,
	SpreadEntry,
	UrbanizationInputs,
	UrbanizationResult,
} from "@/model/society/urbanization/types"

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

	// high medieval — reuse the nearest existing profile
	tribal_government: { U: 0.025, q: 1.0 },
	feudal_government: { U: 0.05, q: 0.85 },
	bureaucratic_government: { U: 0.12, q: 1.2 },
	republic_government: { U: 0.2, q: 1.1 },
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

const MAX_SPREAD_HOPS = 20

function rankSizesForNation({
	governmentTypeIndex,
	totalPopulation,
	provinceCount,
}: RankSizesForNationParams): number[] {
	const { U, q } = nationProfile(governmentTypeIndex)
	const sizes = rankSizeCities({ urbanPop: totalPopulation * U, q })
	return sizes.length > provinceCount ? sizes.slice(0, provinceCount) : sizes
}

// The sovereign's seat gets the capital city, then the seats of the highest
// titles, then everything else; ties go to the more habitable province.
function sortByRank({
	provinces,
	root,
	seatRank,
	habitability,
}: SortByRankParams): number[] {
	const rankOf = (province: number) =>
		province === root ? Number.POSITIVE_INFINITY : seatRank[province]
	return provinces.slice().sort((a, b) => {
		if (rankOf(a) !== rankOf(b)) return rankOf(b) - rankOf(a)
		return habitability[b] - habitability[a]
	})
}

// Higher development first; among equal development a later insertion comes
// first, and the seed cities keep their index order behind every insertion.
function spreadEntryBefore(a: SpreadEntry, b: SpreadEntry): boolean {
	if (a.dev !== b.dev) return a.dev > b.dev
	return a.stamp > b.stamp
}

function pushSpreadEntry(heap: SpreadEntry[], entry: SpreadEntry): void {
	heap.push(entry)
	let i = heap.length - 1
	while (i > 0) {
		const parent = (i - 1) >> 1
		if (!spreadEntryBefore(heap[i], heap[parent])) break
		;[heap[i], heap[parent]] = [heap[parent], heap[i]]
		i = parent
	}
}

function popSpreadEntry(heap: SpreadEntry[]): SpreadEntry {
	const top = heap[0]
	const last = heap.pop() as SpreadEntry
	if (heap.length > 0) {
		heap[0] = last
		let i = 0
		for (;;) {
			let best = i
			const l = 2 * i + 1
			const r = l + 1
			if (l < heap.length && spreadEntryBefore(heap[l], heap[best])) best = l
			if (r < heap.length && spreadEntryBefore(heap[r], heap[best])) best = r
			if (best === i) break
			;[heap[i], heap[best]] = [heap[best], heap[i]]
			i = best
		}
	}
	return top
}

// Development radiating from every city, strongest source first, decaying per
// hop (faster across a border, slower into water-accessible provinces).
function spreadDevelopment({
	count,
	cityMin,
	desolate,
	waterAccess,
	urbanAt,
	sovereignAt,
	neighborsAt,
}: SpreadDevelopmentParams): Float32Array {
	const BASE_DECAY = 0.75
	const FOREIGN_DECAY = 0.65
	const WATER_ACCESS_BONUS = 1.1

	const devFromCities = new Float32Array(count)
	const seeds: SpreadEntry[] = []
	for (let p = 0; p < count; p++) {
		if (desolate[p]) continue
		const urban = urbanAt(p)
		if (urban < cityMin) continue
		const dev = urbanPopToDev(urban)
		devFromCities[p] = dev
		seeds.push({
			province: p,
			dev,
			sourceNation: sovereignAt(p),
			hops: 0,
			stamp: -seeds.length,
		})
	}

	const heap: SpreadEntry[] = []
	for (const seed of seeds) pushSpreadEntry(heap, seed)
	let stamp = 0

	while (heap.length > 0) {
		const { province, dev, sourceNation, hops } = popSpreadEntry(heap)
		if (dev < 0.01 || hops >= MAX_SPREAD_HOPS) continue

		for (const nb of neighborsAt(province)) {
			if (desolate[nb]) continue
			const isForeign = sovereignAt(nb) !== sourceNation

			let decay = isForeign ? FOREIGN_DECAY : BASE_DECAY
			if (waterAccess[nb] === 1) decay *= WATER_ACCESS_BONUS

			const spreadDev = dev * decay
			if (spreadDev < 0.01) continue
			if (devFromCities[nb] >= spreadDev) continue

			devFromCities[nb] = spreadDev
			pushSpreadEntry(heap, {
				province: nb,
				dev: spreadDev,
				sourceNation,
				hops: hops + 1,
				stamp: ++stamp,
			})
		}
	}
	return devFromCities
}

function computeUrbanPopulation(inputs: UrbanizationInputs): Float32Array {
	const { count: P, desolate } = inputs.provinces
	const { parent, sovereign, governmentType, titles } = inputs.nations
	const seatRank = DEJURE.seatRank({
		titles,
		provinceCount: inputs.provinces.count,
		heldOnly: true,
	})
	const { population, habitability } = inputs.population
	const urbanPopulation = new Float32Array(P)

	// Bucket provinces under their sovereign so each nation can be sized as a
	// whole. The sim walked the live hierarchy for this; the static hierarchy
	// gives the same grouping directly.
	const provincesByNation = new Map<number, number[]>()
	for (let p = 0; p < P; p++) {
		if (desolate[p]) continue
		const root = sovereign[p]
		if (root < 0) continue
		const bucket = provincesByNation.get(root)
		if (bucket) bucket.push(p)
		else provincesByNation.set(root, [p])
	}

	for (const [nation, provinces] of provincesByNation) {
		if (desolate[nation] || parent[nation] >= 0) continue

		let totalPop = 0
		for (const prov of provinces) totalPop += population[prov]

		const sorted = sortByRank({
			provinces,
			root: nation,
			seatRank,
			habitability,
		})
		const sizes = rankSizesForNation({
			governmentTypeIndex: governmentType?.[nation] ?? 1,
			totalPopulation: totalPop,
			provinceCount: sorted.length,
		})

		for (let idx = 0; idx < sorted.length; idx++) {
			urbanPopulation[sorted[idx]] = sizes[idx] ?? 0
		}
	}

	return urbanPopulation
}

function computeDevelopment({
	inputs,
	urbanPopulation,
}: ComputeDevelopmentParams): Float32Array {
	const {
		count: P,
		desolate,
		adjOffset,
		adjList,
		waterAccess,
	} = inputs.provinces
	const { sovereign } = inputs.nations
	const { cityMin } = SETTLEMENT_TUNING.getSettlementEraTuning(
		inputs.params.era ?? ERAS.defaultEra,
	)
	const development = spreadDevelopment({
		count: P,
		cityMin,
		desolate,
		waterAccess,
		urbanAt: (p) => urbanPopulation[p],
		sovereignAt: (p) => sovereign[p],
		neighborsAt: (p) => adjList.subarray(adjOffset[p], adjOffset[p + 1]),
	})
	for (let p = 0; p < P; p++) {
		if (desolate[p]) {
			development[p] = 0
			continue
		}
		development[p] = Math.max(development[p], urbanPopToDev(urbanPopulation[p]))
	}
	return development
}

function computeUrbanization(inputs: UrbanizationInputs): UrbanizationResult {
	const urbanPopulation = computeUrbanPopulation(inputs)
	const development = computeDevelopment({ inputs, urbanPopulation })

	const P = inputs.provinces.count
	const total = inputs.population.population
	const ruralPopulation = new Float32Array(P)
	for (let p = 0; p < P; p++) {
		ruralPopulation[p] = Math.max(0, total[p] - urbanPopulation[p])
	}

	return { urbanPopulation, ruralPopulation, development }
}

export const URBANIZATION = {
	computeUrbanization,
	rankSizesForNation,
	sortByRank,
	spreadDevelopment,
	urbanPopToDev,
}
