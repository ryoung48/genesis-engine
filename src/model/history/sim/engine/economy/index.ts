import type {
	ArmyTradition,
	EconomyLookupParams,
	InitEconomyParams,
} from "@/model/history/sim/engine/economy/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { STATE } from "@/model/history/sim/engine/state"
import { MATH } from "@/model/shared/math/core"
import { ERAS } from "@/model/society/eras"

const OUTPUT_CURVE = {
	domain: [0, 0.25, 0.65, 0.95],
	range: [150, 250, 450, 700],
}

const LEVY_RATE: Record<ArmyTradition, number> = {
	paid: 0.02,
	tribal: 0.05,
	steppe: 0.12,
}

// Placeholder for court, administration, church grants, fortification
// upkeep and debt service: spent every year before anything reaches the army.
const CIVIL_EXPENSE_SHARE = 0.7

const MAX_RESERVE_YEARS = 2

// Chiefs collected tribute and gifts, not taxes through an administration.
const COLLECTION_SHARE: Record<ArmyTradition, number> = {
	paid: 1,
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

function revenue({ state, p }: EconomyLookupParams): number {
	const provinces = realmProvinces({ state, p })
	const extraction = KNOWLEDGE.extractionRate({
		knowledge: KNOWLEDGE.realmKnowledge({ state, provinces }),
	})
	let output = 0
	for (const province of provinces)
		output += provinceOutput({ state, p: province })
	return output * extraction * COLLECTION_SHARE[armyTradition({ state, p })]
}

function discretionaryRevenue({ state, p }: EconomyLookupParams): number {
	return revenue({ state, p }) * (1 - CIVIL_EXPENSE_SHARE)
}

function reserveCap({ state, p }: EconomyLookupParams): number {
	return MAX_RESERVE_YEARS * discretionaryRevenue({ state, p })
}

function treasuryFill({ state, p }: EconomyLookupParams): number {
	const cap = reserveCap({ state, p })
	if (cap <= 0) return 0
	return MATH.clamp({
		value: FIELDS.prov.treasury.get({ state, p }) / cap,
		lo: 0,
		hi: 1,
	})
}

function armyTradition({ state, p }: EconomyLookupParams): ArmyTradition {
	const type = ERAS.governmentTypes[state.governmentType[p]]
	if (type === "steppe_horde") return "steppe"
	return type && ERAS.governmentTypeFamily[type] === "tribal"
		? "tribal"
		: "paid"
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
			value: discretionaryRevenue({ state, p }),
		})
		FIELDS.prov.manpower.set({ state, p, value: maxManpower({ state, p }) })
		FIELDS.prov.revenue.set({ state, p, value: revenue({ state, p }) })
	}
}

export const ECONOMY = {
	provinceOutput,
	revenue,
	discretionaryRevenue,
	reserveCap,
	treasuryFill,
	armyTradition,
	maxManpower,
	subtreeManpower,
	initEconomy,
}
