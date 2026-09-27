import { DERIVE } from "@/model/history/sim/engine/derive"
import type {
	ArmyTradition,
	EconomyLookupParams,
	InitEconomyParams,
	TravelDaysParams,
} from "@/model/history/sim/engine/economy/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { STATE } from "@/model/history/sim/engine/state"
import type { RealmCacheEntry } from "@/model/history/sim/engine/state/types"
import { MATH } from "@/model/shared/math/core"
import { ERAS } from "@/model/society/eras"

const DUCATS_PER_GRAM = 1 / 50_000

const OUTPUT_CURVE = {
	domain: [0, 0.25, 0.65, 0.95],
	range: [150, 250, 450, 700].map((grams) => grams * DUCATS_PER_GRAM),
}

const LEVY_RATE: Record<ArmyTradition, number> = {
	settled: 0.02,
	tribal: 0.05,
	steppe: 0.12,
}

const STATE_MAINTENANCE_SHARE = 0.35

const TRAVEL_KM_PER_DAY = 30

const DISTANCE_REFERENCE_DAYS = 30

const DISTANCE_COST = 0.15

const DISTANCE_EXPONENT = 0.7

const SAFE_TREASURY_YEARS = 2

// Chiefs collected tribute and gifts, not taxes through an administration.
const COLLECTION_SHARE: Record<ArmyTradition, number> = {
	settled: 1,
	tribal: 1 / 3,
	steppe: 1 / 3,
}

function realmProvinces({ state, p }: EconomyLookupParams): number[] {
	return STATE.getNationProvinces({ state, root: p }).filter(
		(province) => !state.desolate[province],
	)
}

function provincePopulation({ state, p }: EconomyLookupParams): number {
	return (
		FIELDS.prov.population.rural.get({ state, p }) +
		FIELDS.prov.population.urban.get({ state, p })
	)
}

function provinceOutput({ state, p }: EconomyLookupParams): number {
	return (
		provincePopulation({ state, p }) *
		MATH.piecewise({
			...OUTPUT_CURVE,
			x: FIELDS.prov.development.get({ state, p }),
		}) *
		KNOWLEDGE.productivity({
			knowledge: FIELDS.prov.knowledge.get({ state, p }),
		})
	)
}

function travelDays({ state, capital, p }: TravelDaysParams): number {
	const chord = Math.sqrt(STATE.provinceDistanceSq({ state, a: capital, b: p }))
	const distanceKm =
		2 * state.planetRadiusKm * Math.asin(Math.min(1, chord / 2))
	return distanceKm / TRAVEL_KM_PER_DAY
}

function distanceMultiplier({ state, capital, p }: TravelDaysParams): number {
	return (
		1 +
		DISTANCE_COST *
			(travelDays({ state, capital, p }) / DISTANCE_REFERENCE_DAYS) **
				DISTANCE_EXPONENT
	)
}

function realm({ state, p }: EconomyLookupParams): RealmCacheEntry {
	DERIVE.ensureHierarchyClean(state)
	const cached = state.realmCache.get(p)
	if (
		cached &&
		cached.hierarchyVersion === state.hierarchyVersion &&
		cached.censusVersion === state.censusVersion
	)
		return cached
	const provinces = realmProvinces({ state, p })
	const knowledge = KNOWLEDGE.realmKnowledge({ state, provinces })
	const collected =
		KNOWLEDGE.extractionRate({ knowledge }) *
		COLLECTION_SHARE[armyTradition({ state, p })]
	let output = 0
	let population = 0
	let revenue = 0
	let stateMaintenance = 0
	for (const province of provinces) {
		const provinceOut = provinceOutput({ state, p: province })
		const provinceRevenue = provinceOut * collected
		output += provinceOut
		population += provincePopulation({ state, p: province })
		revenue += provinceRevenue
		stateMaintenance +=
			provinceRevenue *
			STATE_MAINTENANCE_SHARE *
			distanceMultiplier({ state, capital: p, p: province })
	}
	const entry = {
		hierarchyVersion: state.hierarchyVersion,
		censusVersion: state.censusVersion,
		knowledge,
		revenue,
		stateMaintenance,
		outputPerHead: population > 0 ? output / population / DUCATS_PER_GRAM : 0,
	}
	state.realmCache.set(p, entry)
	return entry
}

function revenue({ state, p }: EconomyLookupParams): number {
	return realm({ state, p }).revenue
}

function realmKnowledge({ state, p }: EconomyLookupParams): number {
	return realm({ state, p }).knowledge
}

function stateMaintenance({ state, p }: EconomyLookupParams): number {
	return realm({ state, p }).stateMaintenance
}

function surplus({ state, p }: EconomyLookupParams): number {
	const entry = realm({ state, p })
	return entry.revenue - entry.stateMaintenance
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

function armyTradition({ state, p }: EconomyLookupParams): ArmyTradition {
	const type = ERAS.governmentTypes[state.governmentType[p]]
	if (type === "steppe_horde") return "steppe"
	return type && ERAS.governmentTypeFamily[type] === "tribal"
		? "tribal"
		: "settled"
}

function maxManpower({ state, p }: EconomyLookupParams): number {
	return (
		STATE.getNationPopulation({ state, root: p }) *
		LEVY_RATE[armyTradition({ state, p })]
	)
}

function subtreeManpower({ state, p }: EconomyLookupParams): number {
	const sovereign = STATE.getSovereign({ state, p })
	const realmPop = STATE.getNationPopulation({ state, root: sovereign })
	if (realmPop <= 0) return 0
	return (
		(FIELDS.prov.manpower.get({ state, p: sovereign }) *
			STATE.getNationPopulation({ state, root: p })) /
		realmPop
	)
}

function initEconomy({ state }: InitEconomyParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p] || !STATE.isSovereign({ state, p })) continue
		FIELDS.prov.treasury.set({
			state,
			p,
			value: Math.max(0, surplus({ state, p })),
		})
		FIELDS.prov.manpower.set({ state, p, value: maxManpower({ state, p }) })
		FIELDS.prov.maxManpower.set({ state, p, value: maxManpower({ state, p }) })
		FIELDS.prov.revenue.set({ state, p, value: revenue({ state, p }) })
	}
}

export const ECONOMY = {
	ducatsPerGram: DUCATS_PER_GRAM,
	provinceOutput,
	revenue,
	realmKnowledge,
	travelDays,
	distanceMultiplier,
	stateMaintenance,
	surplus,
	outputPerHead,
	treasurySafe,
	treasuryFill,
	armyTradition,
	maxManpower,
	subtreeManpower,
	initEconomy,
}
