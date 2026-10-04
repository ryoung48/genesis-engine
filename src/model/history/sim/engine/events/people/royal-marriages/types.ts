import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { CrossMatch } from "@/model/history/sim/people/types"

export interface AllianceMatchParams {
	state: HistoryState
	match: CrossMatch
}

export interface PairKeyParams {
	state: HistoryState
	a: number
	b: number
}

export interface ReviewParams {
	state: HistoryState
}
