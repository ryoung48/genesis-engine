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
	levyExpenses: number
	regularExpenses: number
	treasuryLeakage: number
	annualBalance: number
	plunder: number
	tributeReceived: number
	indemnityReceived: number
	boughtPeace: number
	succession: number
	coronationExpenses: number
	otherChangesTotal: number
	treasurySafe: number
	settled: boolean
	year: number
}
