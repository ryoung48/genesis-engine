import type { HistoryState } from "@/model/history/generated/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

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
	rng: SharedRng
}
