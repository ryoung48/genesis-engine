import type { HistoryState } from "@/model/history/sim/engine/state/types"

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
