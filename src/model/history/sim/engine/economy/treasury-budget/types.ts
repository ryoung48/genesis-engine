import type { ArmyTradition } from "@/model/history/sim/engine/economy/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface TreasuryBudgetLookupParams {
	state: HistoryState
	p: number
}

export interface TreasuryBudget {
	taxes: number
	tribute: number
	indemnity: number
	stateMaintenance: number
	armyExpenses: number
	// Army maintenance was charged at wartime rates.
	wartimeRates: boolean
	treasuryLeakage: number
	annualBalance: number
	plunder: number
	tributeReceived: number
	indemnityReceived: number
	boughtPeace: number
	succession: number
	otherChangesTotal: number
	treasurySafe: number
	tradition: ArmyTradition
	settled: boolean
	year: number
}
