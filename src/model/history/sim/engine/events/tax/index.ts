import { DATE } from "@/model/history/earth/date"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import type {
	InitTaxParams,
	Levy,
	RecordBudgetParams,
	RunTaxParams,
	ScheduleTaxParams,
	Settlement,
} from "@/model/history/sim/engine/events/tax/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"

const MANPOWER_RECOVERY = 0.1

const LEAKAGE_RATE = 0.04
const TRIBUTE_SHARE = 0.1

// Chiefs cannot spend what their treasury does not hold: tribal and steppe
// realms pay maintenance, then warriors, only from cash in hand.
function settle({
	state,
	nation,
	yearFraction,
	settled,
}: RecordBudgetParams): Settlement {
	const revenue = ECONOMY.revenue({ state, p: nation }) * yearFraction
	const overlord = STATE.diplomaticOverlord({ state, nation })
	const levies: Levy[] = []
	if (overlord >= 0 && VASSALAGE.pays({ state, vassal: nation, overlord }))
		levies.push({
			receiver: overlord,
			amount: TRIBUTE_SHARE * revenue,
			kind: "tribute",
		})
	else if (settled && overlord >= 0)
		state.events.push({
			tag: "tribute withheld",
			time: state.time,
			data: { vassal: nation, overlord },
		})
	for (const indemnity of state.indemnities)
		if (
			indemnity.payer === nation &&
			indemnity.until > state.time &&
			STATE.isSovereign({ state, p: indemnity.receiver })
		)
			levies.push({
				receiver: indemnity.receiver,
				amount: PEACE.indemnityShare * revenue,
				kind: "indemnity",
			})
	const tribute = levies
		.filter((levy) => levy.kind === "tribute")
		.reduce((sum, levy) => sum + levy.amount, 0)
	const indemnity = levies
		.filter((levy) => levy.kind === "indemnity")
		.reduce((sum, levy) => sum + levy.amount, 0)
	const maintenance =
		ECONOMY.stateMaintenance({ state, p: nation }) * yearFraction
	const upkeep = MILITARY.upkeep({ state, nation }) * yearFraction
	const opening = FIELDS.prov.treasury.get({ state, p: nation })
	const tradition = ECONOMY.armyTradition({ state, p: nation })
	const cash = opening + revenue - tribute - indemnity
	const maintenancePaid =
		tradition === "settled"
			? maintenance
			: Math.min(maintenance, Math.max(0, cash))
	const armyPaid =
		tradition === "settled"
			? upkeep
			: Math.min(upkeep, Math.max(0, cash - maintenancePaid))
	const beforeLeakage = cash - maintenancePaid - armyPaid
	const safe = ECONOMY.treasurySafe({ state, p: nation })
	const annualLeakage =
		safe > 0
			? safe *
				LEAKAGE_RATE *
				Math.max(0, Math.max(0, beforeLeakage) / safe - 1) ** 2
			: Number.POSITIVE_INFINITY
	const leakage = Math.min(
		Math.max(0, beforeLeakage),
		annualLeakage * yearFraction,
	)
	const budget = TREASURY_BUDGET.get({ state, p: nation })
	budget.taxes = revenue
	budget.tribute = tribute > 0 ? -tribute : 0
	budget.indemnity = indemnity > 0 ? -indemnity : 0
	budget.stateMaintenance = -maintenancePaid
	budget.armyExpenses = -armyPaid
	budget.wartimeRates = MILITARY.atWar({ state, nation })
	budget.treasuryLeakage = -leakage
	budget.annualBalance =
		revenue - tribute - indemnity - maintenancePaid - armyPaid - leakage
	budget.treasurySafe = safe
	budget.tradition = tradition
	budget.settled = settled
	budget.year = DATE.historyTimeMsToYear(state.time)
	return { treasury: beforeLeakage - leakage, levies }
}

function previewBudget({ state }: InitTaxParams): void {
	const year = DATE.historyTimeMsToYear(state.time)
	for (let p = 0; p < state.P; p++) {
		if (!STATE.isSovereign({ state, p })) continue
		if (state.treasuryBudgetCurrent.get(p)?.year === year) continue
		settle({ state, nation: p, yearFraction: 1, settled: false })
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
	state.indemnities = state.indemnities.filter(
		(entry) =>
			entry.payer !== nation ||
			(entry.until > state.time &&
				STATE.isSovereign({ state, p: entry.payer }) &&
				STATE.isSovereign({ state, p: entry.receiver })),
	)
	if (!STATE.isSovereign({ state, p: nation })) return

	const yearFraction = (state.time - previousTime) / STATE.yearMs
	const maxManpower = ECONOMY.maxManpower({ state, p: nation })
	const { treasury, levies } = settle({
		state,
		nation,
		yearFraction,
		settled: true,
	})
	FIELDS.prov.revenue.set({
		state,
		p: nation,
		value: ECONOMY.revenue({ state, p: nation }),
	})
	FIELDS.prov.treasury.set({ state, p: nation, value: treasury })
	for (const levy of levies) {
		FIELDS.prov.treasury.set({
			state,
			p: levy.receiver,
			value:
				FIELDS.prov.treasury.get({ state, p: levy.receiver }) + levy.amount,
		})
		const budget = TREASURY_BUDGET.get({ state, p: levy.receiver })
		if (levy.kind === "tribute") budget.tributeReceived += levy.amount
		else budget.indemnityReceived += levy.amount
		budget.otherChangesTotal += levy.amount
	}
	FIELDS.prov.maxManpower.set({ state, p: nation, value: maxManpower })
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
