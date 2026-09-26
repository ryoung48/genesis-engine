import { DATE } from "@/model/history/earth/date"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	InitTaxParams,
	RecordBudgetParams,
	RecordedBudget,
	RunTaxParams,
	ScheduleTaxParams,
} from "@/model/history/sim/engine/events/tax/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"

const MANPOWER_RECOVERY = 0.1

function recordBudget({
	state,
	nation,
	yearFraction,
	settled,
}: RecordBudgetParams): RecordedBudget {
	const upkeep = MILITARY.upkeep({ state, nation })
	const revenue = ECONOMY.revenue({ state, p: nation })
	const discretionary = ECONOMY.discretionaryRevenue({ state, p: nation })
	const budget = TREASURY_BUDGET.get({ state, p: nation })
	budget.taxes = revenue * yearFraction
	budget.civilExpenses = -(revenue - discretionary) * yearFraction
	budget.armyExpenses = -upkeep * yearFraction
	budget.annualBalance =
		budget.taxes + budget.civilExpenses + budget.armyExpenses
	budget.tradition = ECONOMY.armyTradition({ state, p: nation })
	budget.settled = settled
	budget.year = DATE.historyTimeMsToYear(state.time)
	return { budget, revenue, discretionary, upkeep }
}

function previewBudget({ state }: InitTaxParams): void {
	const year = DATE.historyTimeMsToYear(state.time)
	for (let p = 0; p < state.P; p++) {
		if (!STATE.isSovereign({ state, p })) continue
		if (state.treasuryBudgetCurrent.get(p)?.year === year) continue
		recordBudget({ state, nation: p, yearFraction: 1, settled: false })
	}
}

function scheduleTax({ state, nation }: ScheduleTaxParams): void {
	state.heap.enqueue(
		state.time + STATE.yearMs,
		EVENT_HEAP.evt.TAX,
		nation,
		0,
		0,
		0,
		state.time,
	)
}

function initTax({ state }: InitTaxParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		scheduleTax({ state, nation: p })
	}
	previewBudget({ state })
}

function runTax({ state, nation, previousTime }: RunTaxParams): void {
	scheduleTax({ state, nation })
	if (!STATE.isSovereign({ state, p: nation })) return

	const yearFraction = (state.time - previousTime) / STATE.yearMs
	const maxManpower = ECONOMY.maxManpower({ state, p: nation })
	const { budget, revenue, discretionary, upkeep } = recordBudget({
		state,
		nation,
		yearFraction,
		settled: true,
	})
	FIELDS.prov.revenue.set({
		state,
		p: nation,
		value: revenue,
	})
	const floor =
		ECONOMY.armyTradition({ state, p: nation }) === "paid"
			? Number.NEGATIVE_INFINITY
			: 0
	const unsettledTreasury =
		FIELDS.prov.treasury.get({ state, p: nation }) +
		(discretionary - upkeep) * yearFraction
	const settledTreasury = Math.max(
		floor,
		Math.min(ECONOMY.reserveCap({ state, p: nation }), unsettledTreasury),
	)
	const reserveAdjustment = settledTreasury - unsettledTreasury
	budget.reserveAdjustment += reserveAdjustment
	budget.otherChangesTotal += reserveAdjustment
	FIELDS.prov.treasury.set({
		state,
		p: nation,
		value: settledTreasury,
	})
	const manpower = FIELDS.prov.manpower.get({ state, p: nation })
	FIELDS.prov.manpower.set({
		state,
		p: nation,
		value: Math.min(
			maxManpower,
			manpower + (maxManpower - manpower) * MANPOWER_RECOVERY * yearFraction,
		),
	})
}

export const TAX = {
	initTax,
	previewBudget,
	runTax,
}
