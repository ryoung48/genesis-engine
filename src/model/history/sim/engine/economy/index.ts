import { DERIVE } from "@/model/history/sim/engine/derive"
import type {
	EconomyLookupParams,
	InitEconomyParams,
	TerritoryParams,
	TravelDaysParams,
} from "@/model/history/sim/engine/economy/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { STATE } from "@/model/history/sim/engine/state"
import type { RealmCacheEntry } from "@/model/history/sim/engine/state/types"
import { MATH } from "@/model/shared/math/core"

const DUCATS_PER_GRAM = 1 / 50_000

const OUTPUT_CURVE = {
	domain: [0, 0.25, 0.65, 0.95],
	range: [150, 250, 450, 700].map((grams) => grams * DUCATS_PER_GRAM),
}

const STATE_MAINTENANCE_SHARE = 0.35

const TRAVEL_KM_PER_DAY = 30

const DISTANCE_REFERENCE_DAYS = 30

const DISTANCE_COST = 0.15

const DISTANCE_EXPONENT = 0.7

const SAFE_TREASURY_YEARS = 2

// The settled provinces of a realm, in the same order as STATE.getNationProvinces.
function realmProvinces({ state, p }: EconomyLookupParams): number[] {
	const { childOffset, childList, desolate } = state
	const result = desolate[p] ? [] : [p]
	const stack = [p]
	while (stack.length > 0) {
		const current = stack.pop() as number
		for (let i = childOffset[current]; i < childOffset[current + 1]; i++) {
			const child = childList[i]
			if (!desolate[child]) result.push(child)
			stack.push(child)
		}
	}
	return result
}

// Output is population times a development factor times a knowledge factor.
// The two factors change only at a census, so they are kept per province.
function refreshOutputFactors({ state, p }: EconomyLookupParams): void {
	const cache = state.provinceEconomyCache
	const development = state.developmentCurrent[p]
	const knowledge = state.knowledgeCurrent[p]
	if (cache.development[p] !== development) {
		cache.development[p] = development
		cache.developmentFactor[p] = MATH.piecewise({
			domain: OUTPUT_CURVE.domain,
			range: OUTPUT_CURVE.range,
			x: development,
		})
	}
	if (cache.knowledge[p] !== knowledge) {
		cache.knowledge[p] = knowledge
		cache.knowledgeFactor[p] = KNOWLEDGE.productivity({ knowledge })
	}
}

function provinceOutput({ state, p }: EconomyLookupParams): number {
	refreshOutputFactors({ state, p })
	const cache = state.provinceEconomyCache
	return (
		(state.popRuralCurrent[p] + state.popUrbanCurrent[p]) *
		cache.developmentFactor[p] *
		cache.knowledgeFactor[p]
	)
}

function travelDays({ state, capital, p }: TravelDaysParams): number {
	const chord = Math.sqrt(STATE.provinceDistanceSq({ state, a: capital, b: p }))
	const distanceKm =
		2 * state.planetRadiusKm * Math.asin(Math.min(1, chord / 2))
	return distanceKm / TRAVEL_KM_PER_DAY
}

function distanceMultiplier({ state, capital, p }: TravelDaysParams): number {
	const cache = state.provinceEconomyCache
	if (cache.capital[p] === capital) return cache.distanceMultiplier[p]
	const multiplier =
		1 +
		DISTANCE_COST *
			(travelDays({ state, capital, p }) / DISTANCE_REFERENCE_DAYS) **
				DISTANCE_EXPONENT
	cache.capital[p] = capital
	cache.distanceMultiplier[p] = multiplier
	return multiplier
}

function realm({ state, p }: EconomyLookupParams): RealmCacheEntry {
	DERIVE.ensureHierarchyClean(state)
	const cached = state.realmCache.get(p)
	if (
		cached &&
		cached.censusVersion === state.censusVersion &&
		// Once the military is running, every parent change drops the entries
		// of both affected chains, so an unrelated hierarchy change elsewhere
		// leaves this one valid.
		(state.militaryReady || cached.hierarchyVersion === state.hierarchyVersion)
	)
		return cached
	const entry = territory({ state, p, provinces: realmProvinces({ state, p }) })
	state.realmCache.set(p, entry)
	return entry
}

function territory({ state, p, provinces }: TerritoryParams): RealmCacheEntry {
	const knowledge = KNOWLEDGE.realmKnowledge({ state, provinces })
	const collected = KNOWLEDGE.extractionRate({ knowledge })
	const cache = state.provinceEconomyCache
	const {
		popRuralCurrent,
		popUrbanCurrent,
		developmentCurrent,
		knowledgeCurrent,
	} = state
	let output = 0
	let population = 0
	let revenue = 0
	let stateMaintenance = 0
	for (let i = 0; i < provinces.length; i++) {
		const province = provinces[i]
		const provincePopulation =
			popRuralCurrent[province] + popUrbanCurrent[province]
		if (
			cache.development[province] !== developmentCurrent[province] ||
			cache.knowledge[province] !== knowledgeCurrent[province]
		)
			refreshOutputFactors({ state, p: province })
		const provinceOut =
			provincePopulation *
			cache.developmentFactor[province] *
			cache.knowledgeFactor[province]
		const provinceRevenue = provinceOut * collected
		output += provinceOut
		population += provincePopulation
		revenue += provinceRevenue
		stateMaintenance +=
			provinceRevenue *
			STATE_MAINTENANCE_SHARE *
			(cache.capital[province] === p
				? cache.distanceMultiplier[province]
				: distanceMultiplier({ state, capital: p, p: province }))
	}
	return {
		population,
		hierarchyVersion: state.hierarchyVersion,
		censusVersion: state.censusVersion,
		knowledge,
		revenue,
		stateMaintenance,
		outputPerHead: population > 0 ? output / population / DUCATS_PER_GRAM : 0,
	}
}

function realmPopulation({ state, p }: EconomyLookupParams): number {
	return realm({ state, p }).population
}

function revenue({ state, p }: EconomyLookupParams): number {
	return (
		realm({ state, p }).revenue *
		GOVERNOR.factor({
			attribute: "stewardship",
			value: GOVERNOR.attribute({ state, realm: p, attribute: "stewardship" }),
		}) *
		GOVERNOR.incomeFactor({ state, realm: p })
	)
}

function realmKnowledge({ state, p }: EconomyLookupParams): number {
	return realm({ state, p }).knowledge
}

function stateMaintenance({ state, p }: EconomyLookupParams): number {
	return realm({ state, p }).stateMaintenance
}

function surplus({ state, p }: EconomyLookupParams): number {
	const entry = realm({ state, p })
	return revenue({ state, p }) - entry.stateMaintenance
}

function outputPerHead({ state, p }: EconomyLookupParams): number {
	return realm({ state, p }).outputPerHead
}

function treasurySafe({ state, p }: EconomyLookupParams): number {
	return SAFE_TREASURY_YEARS * Math.max(0, surplus({ state, p }))
}

function treasuryFill({ state, p }: EconomyLookupParams): number {
	const safe = treasurySafe({ state, p })
	if (safe <= 0) return 0
	return MATH.clamp({
		value: FIELDS.prov.treasury.get({ state, p }) / safe,
		lo: 0,
		hi: 1,
	})
}

function initEconomy({ state }: InitEconomyParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p] || !STATE.isSovereign({ state, p })) continue
		FIELDS.prov.treasury.set({
			state,
			p,
			value: Math.max(0, surplus({ state, p })),
		})
		FIELDS.prov.revenue.set({ state, p, value: revenue({ state, p }) })
	}
}

export const ECONOMY = {
	realm,
	territory,
	ducatsPerGram: DUCATS_PER_GRAM,
	provinceOutput,
	realmPopulation,
	revenue,
	realmKnowledge,
	travelDays,
	distanceMultiplier,
	stateMaintenance,
	surplus,
	outputPerHead,
	treasurySafe,
	treasuryFill,
	initEconomy,
}
