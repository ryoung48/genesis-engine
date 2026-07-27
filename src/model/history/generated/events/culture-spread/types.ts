import type { HistoryRng } from "@/model/history/generated/history-rng/types"
import type { HistoryState } from "@/model/history/generated/state/types"

export interface IsBleedEdgeParams {
	seedA: number
	seedB: number
	probability: number
}

export interface ComputeCulturePopulationsParams {
	state: HistoryState
	cultureCount: number
}

export interface RunCultureSpreadParams {
	state: HistoryState
	cultureCount: number
	rng: HistoryRng
}
