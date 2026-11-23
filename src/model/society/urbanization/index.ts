import { MATH } from "@/model/shared/math/core"
import { DEJURE } from "@/model/society/dejure"
import { ERAS } from "@/model/society/eras"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import { TECH_LEVEL } from "@/model/society/tech-level"
import type { GovernmentType } from "@/model/society/types"
import type {
	CityTargetsParams,
	ComputeDevelopmentParams,
	NationProfile,
	RankSizeCitiesParams,
	RankSizesForNationParams,
	SortByRankParams,
	SpreadDevelopmentParams,
	SpreadEntry,
	StateDevelopmentParams,
	TechKnowledgeParams,
	UrbanizationInputs,
	UrbanizationResult,
	UrbanKnowledge,
} from "@/model/society/urbanization/types"

const GOVERNMENT_PROFILES: Record<GovernmentType, NationProfile> = {
	// tribal — negligible true urbanization, flat-to-moderate hierarchy
	chiefdom: { U: 0.015, q: 0.9 }, // single hereditary seat, no real hierarchy
	tribal_monarchy: { U: 0.025, q: 1.0 }, // one organised royal seat
	tribal_federation: { U: 0.03, q: 0.75 }, // multi-tribe council, several similar centers
	native_council: { U: 0.015, q: 0.8 }, // small frontier council, flat and sparse

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

const REALM_REFERENCE_POPULATION = 10_000_000

const REALM_EXPONENT = 0.3

const MAX_REALM_FACTOR = 2.5

function realmCityFactor(realmPopulation: number): number {
	return Math.min(
		MAX_REALM_FACTOR,
		(realmPopulation / REALM_REFERENCE_POPULATION) ** REALM_EXPONENT,
	)
}

function techKnowledge({
	nations,
	population,
}: TechKnowledgeParams): UrbanKnowledge {
	const realm = TECH_LEVEL.realmLevels({
		sovereign: nations.sovereign,
		population: population.population,
		techLevel: population.techLevel,
	})
	let mass = 0
	let weight = 0
	for (let p = 0; p < nations.sovereign.length; p++) {
		const root = nations.sovereign[p]
		if (root < 0) continue
		const people = population.population[p]
		mass += people * nationProfile(nations.governmentType?.[root] ?? 1).U
		weight += people
	}
	const meanShare = weight > 0 && mass > 0 ? mass / weight : 1
	return {
		urbanFactor: (nation) =>
			TECH_LEVEL.urbanShare({ techLevel: realm[nation] }) / meanShare,
		maxCitySize: ({ nation, realmPopulation }) =>
			(TECH_LEVEL.largestCity({ techLevel: realm[nation] }) /
				MAX_REALM_FACTOR) *
			realmCityFactor(realmPopulation),
	}
}

const MAX_SPREAD_HOPS = 20

const MAX_URBAN_SHARE = 0.85

const TOWN_LIMIT = 25_000

const RANK_CAP_EXPONENT = 1.3

function cityTargets({
	sizes,
	count,
	maxCitySizeAt,
	ruralAt,
}: CityTargetsParams): number[] {
	const targets = Array.from({ length: count }, (_, idx) =>
		Math.min(
			sizes[idx] ?? 0,
			maxCitySizeAt(idx) / (idx + 1) ** RANK_CAP_EXPONENT,
		),
	)
	let excess = 0
	for (let idx = 0; idx < sizes.length; idx++)
		excess += sizes[idx] - targets[idx]
	let ruralMass = 0
	for (let idx = 0; idx < count; idx++)
		if (targets[idx] < TOWN_LIMIT) ruralMass += ruralAt(idx)
	if (excess <= 0 || ruralMass <= 0) return targets
	for (let idx = 0; idx < count; idx++) {
		if (targets[idx] >= TOWN_LIMIT) continue
		targets[idx] = Math.min(
			TOWN_LIMIT,
			targets[idx] + (excess * ruralAt(idx)) / ruralMass,
		)
	}
	return targets
}

function rankSizesForNation({
	governmentTypeIndex,
	totalPopulation,
	provinceCount,
	urbanFactor,
}: RankSizesForNationParams): number[] {
	const { U, q } = nationProfile(governmentTypeIndex)
	const share = Math.min(MAX_URBAN_SHARE, U * urbanFactor)
	const sizes = rankSizeCities({ urbanPop: totalPopulation * share, q })
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

const FRONTIER_LOSS = 0.15

// Development as states hold it: each state province keeps its city
// development, frontier provinces without a town lose a share per stateless
// neighbour, and stateless land keeps none of its own.
function stateDevelopment({
	provinces,
	sovereign,
	development,
	urbanPopulation,
}: StateDevelopmentParams): Float32Array {
	const { count, desolate, adjOffset, adjList } = provinces
	return Float32Array.from({ length: count }, (_, p) => {
		if (desolate[p] || sovereign[p] < 0) return 0
		if (urbanPopulation[p] > 0) return development[p]
		let stateless = 0
		for (let i = adjOffset[p]; i < adjOffset[p + 1]; i++) {
			const nb = adjList[i]
			if (!desolate[nb] && sovereign[nb] < 0) stateless++
		}
		return development[p] * (1 - FRONTIER_LOSS) ** stateless
	})
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
	const realmPopulation = new Map<number, number>()
	for (let p = 0; p < P; p++) {
		if (desolate[p]) continue
		const root = sovereign[p]
		if (root < 0) continue
		realmPopulation.set(
			root,
			(realmPopulation.get(root) ?? 0) + inputs.population.population[p],
		)
		// Foraging provinces hold no towns; a realm's capital always may.
		if (inputs.foraging[p] && p !== root) continue
		const bucket = provincesByNation.get(root)
		if (bucket) bucket.push(p)
		else provincesByNation.set(root, [p])
	}

	for (const [nation, provinces] of provincesByNation) {
		if (desolate[nation] || parent[nation] >= 0) continue

		const totalPop = realmPopulation.get(nation) ?? 0

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
			urbanFactor: inputs.knowledge.urbanFactor(nation),
		})
		const maxCitySize = inputs.knowledge.maxCitySize({
			nation,
			realmPopulation: totalPop,
		})
		const targets = cityTargets({
			sizes,
			count: sorted.length,
			maxCitySizeAt: () => maxCitySize,
			ruralAt: (idx) => population[sorted[idx]],
		})

		for (let idx = 0; idx < sorted.length; idx++) {
			urbanPopulation[sorted[idx]] = targets[idx]
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
	const { cityMin } = SETTLEMENT_TUNING.getSettlementEraTuning(inputs.era)
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
	cityTargets,
	computeUrbanization,
	rankSizesForNation,
	realmCityFactor,
	techKnowledge,
	sortByRank,
	spreadDevelopment,
	stateDevelopment,
	urbanPopToDev,
}
