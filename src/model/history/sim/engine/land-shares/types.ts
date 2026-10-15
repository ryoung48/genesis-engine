import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface LandSharesRefreshParams {
	state: HistoryState
}

export interface RealmRootParams {
	state: HistoryState
	root: number
}
