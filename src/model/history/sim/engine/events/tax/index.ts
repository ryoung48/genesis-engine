import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	InitTaxParams,
	RunTaxParams,
	ScheduleTaxParams,
} from "@/model/history/sim/engine/events/tax/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"

const MANPOWER_RECOVERY = 0.1

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
}

function runTax({ state, nation, previousTime }: RunTaxParams): void {
	scheduleTax({ state, nation })
	if (!STATE.isSovereign({ state, p: nation })) return

	const yearFraction = (state.time - previousTime) / STATE.yearMs
	const maxManpower = ECONOMY.maxManpower({ state, p: nation })
	const upkeep = MILITARY.upkeep({ state, nation })
	const discretionary = ECONOMY.discretionaryRevenue({ state, p: nation })
	FIELDS.prov.revenue.set({
		state,
		p: nation,
		value: ECONOMY.revenue({ state, p: nation }),
	})
	const floor =
		ECONOMY.armyTradition({ state, p: nation }) === "paid"
			? Number.NEGATIVE_INFINITY
			: 0
	FIELDS.prov.treasury.set({
		state,
		p: nation,
		value: Math.max(
			floor,
			Math.min(
				ECONOMY.reserveCap({ state, p: nation }),
				FIELDS.prov.treasury.get({ state, p: nation }) +
					(discretionary - upkeep) * yearFraction,
			),
		),
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
	runTax,
}
