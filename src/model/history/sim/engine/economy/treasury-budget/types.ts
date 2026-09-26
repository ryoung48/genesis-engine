import type { ArmyTradition } from "@/model/history/sim/engine/economy/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface TreasuryBudgetLookupParams {
	state: HistoryState
	p: number
}

export interface TreasuryBudget {
	taxes: number
	civilExpenses: number
	armyExpenses: number
	annualBalance: number
	plunder: number
	succession: number
	reserveAdjustment: number
	otherChangesTotal: number
	tradition: ArmyTradition
	settled: boolean
	year: number
}
