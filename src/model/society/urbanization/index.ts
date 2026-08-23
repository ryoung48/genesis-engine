import { MATH } from "@/model/shared/math/core"
import { ERAS } from "@/model/society/eras"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import type { GovernmentType } from "@/model/society/types"
import type {
	ComputeDevelopmentParams,
	NationProfile,
	RankSizeCitiesParams,
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

function computeUrbanPopulation(inputs: UrbanizationInputs): Float32Array {
	const { count: P, desolate } = inputs.provinces
	const { parent, depth, sovereign, governmentType } = inputs.nations
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

		const { U, q } = nationProfile(governmentType?.[nation] ?? 1)
		const urbanPop = totalPop * U

		// Sort by hierarchy depth ascending (the sovereign, depth 0, gets the
		// capital city), breaking ties by habitability so deeper-ranked
		// provinces still differ meaningfully.
		const sorted = provinces.slice().sort((a, b) => {
			if (depth[a] !== depth[b]) return depth[a] - depth[b]
			return habitability[b] - habitability[a]
		})

		let sizes = rankSizeCities({ urbanPop, q })
		if (sizes.length > sorted.length) sizes = sizes.slice(0, sorted.length)

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
		inputs.params.era ?? "lateMedieval",
	)
	const BASE_DECAY = 0.75
	const FOREIGN_DECAY = 0.65
	const WATER_ACCESS_BONUS = 1.1

	const cities: { province: number; dev: number; sourceNation: number }[] = []
	for (let p = 0; p < P; p++) {
		if (desolate[p]) continue
		if (urbanPopulation[p] >= cityMin) {
			cities.push({
				province: p,
				dev: urbanPopToDev(urbanPopulation[p]),
				sourceNation: sovereign[p],
			})
		}
	}

	const devFromCities = new Float32Array(P)
	const queue: {
		province: number
		dev: number
		sourceNation: number
		hops: number
	}[] = cities.map((c) => ({ ...c, hops: 0 })).sort((a, b) => b.dev - a.dev)

	for (const city of cities) devFromCities[city.province] = city.dev

	while (queue.length > 0) {
		const { province, dev, sourceNation, hops } = queue.shift()!
		if (dev < 0.01 || hops >= MAX_SPREAD_HOPS) continue

		for (
			let i = adjOffset[province], end = adjOffset[province + 1];
			i < end;
			i++
		) {
			const nb = adjList[i]
			if (desolate[nb]) continue
			const isForeign = sovereign[nb] !== sourceNation
			const hasWaterAccess = waterAccess[nb] === 1

			let decay = isForeign ? FOREIGN_DECAY : BASE_DECAY
			if (hasWaterAccess) decay *= WATER_ACCESS_BONUS

			const spreadDev = dev * decay
			if (spreadDev < 0.01) continue
			if (devFromCities[nb] >= spreadDev) continue

			devFromCities[nb] = spreadDev

			// Insert maintaining descending-dev order.
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

	const development = new Float32Array(P)
	for (let p = 0; p < P; p++) {
		if (desolate[p]) continue
		development[p] = Math.max(
			devFromCities[p],
			urbanPopToDev(urbanPopulation[p]),
		)
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
}
