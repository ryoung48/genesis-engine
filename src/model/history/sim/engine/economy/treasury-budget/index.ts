import type {
	TreasuryBudget,
	TreasuryBudgetLookupParams,
} from "@/model/history/sim/engine/economy/treasury-budget/types"

function get({ state, p }: TreasuryBudgetLookupParams): TreasuryBudget {
	let budget = state.treasuryBudgetCurrent.get(p)
	if (!budget) {
		budget = {
			taxes: 0,
			tribute: 0,
			indemnity: 0,
			stateMaintenance: 0,
			armyExpenses: 0,
			levyExpenses: 0,
			regularExpenses: 0,
			treasuryLeakage: 0,
			annualBalance: 0,
			plunder: 0,
			tributeReceived: 0,
			indemnityReceived: 0,
			boughtPeace: 0,
			succession: 0,
			titleCreationExpenses: 0,
			otherChangesTotal: 0,
			treasurySafe: 0,
			settled: false,
			year: Number.NEGATIVE_INFINITY,
		}
		state.treasuryBudgetCurrent.set(p, budget)
	}
	return budget
}

export const TREASURY_BUDGET = { get }
