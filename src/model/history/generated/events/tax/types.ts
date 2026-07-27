import type { HistoryState } from "@/model/history/generated/state/types"

export interface PeaceFractionParams {
	state: HistoryState
	nation: number
	previous: number
}

export interface InitTaxParams {
	state: HistoryState
}

export interface RunTaxParams {
	state: HistoryState
	nation: number
	previousTime: number
}
