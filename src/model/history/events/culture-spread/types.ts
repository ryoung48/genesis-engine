import type { HistoryRng } from "@/model/history/history-rng/types"
import type { HistoryState } from "@/model/history/state/types"

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
