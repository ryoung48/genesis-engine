import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface RecordBudgetParams {
	state: HistoryState
	nation: number
	yearFraction: number
	settled: boolean
}

export interface Settlement {
	treasury: number
}

export interface InitTaxParams {
	state: HistoryState
}

export interface RunTaxParams {
	state: HistoryState
	nation: number
	previousTime: number
}

export interface ScheduleTaxParams {
	state: HistoryState
	nation: number
}
