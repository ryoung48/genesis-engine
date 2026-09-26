import type {
	TreasuryBudget,
	TreasuryBudgetLookupParams,
} from "@/model/history/sim/engine/economy/treasury-budget/types"

function get({ state, p }: TreasuryBudgetLookupParams): TreasuryBudget {
	let budget = state.treasuryBudgetCurrent.get(p)
	if (!budget) {
		budget = {
			taxes: 0,
			civilExpenses: 0,
			armyExpenses: 0,
			annualBalance: 0,
			plunder: 0,
			succession: 0,
			reserveAdjustment: 0,
			otherChangesTotal: 0,
			tradition: "paid",
			settled: false,
			year: Number.NEGATIVE_INFINITY,
		}
		state.treasuryBudgetCurrent.set(p, budget)
	}
	return budget
}

export const TREASURY_BUDGET = { get }
