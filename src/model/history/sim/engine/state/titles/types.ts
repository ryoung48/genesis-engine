import { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface ApplyDerivedParentsParams {
	state: HistoryState
	nation: number
	members: number[]
}

export interface ConsiderTitlesParams {
	state: HistoryState
	nation: number
	rng: SharedRng
	revenueOf: (nation: number) => number
}

export interface DissolveLapsedParams {
	state: HistoryState
	nation: number
}

export interface FoundTitleForParams extends ConsiderTitlesParams {
	tier: number
}

export interface RelinkNationsParams {
	state: HistoryState
	nations: Iterable<number>
}

export interface SettleProvincesParams {
	state: HistoryState
	provinces: number[]
}

export interface SettleTitleSetParams {
	state: HistoryState
	touched: Set<number>
}

export interface TitleRevenueBarParams {
	state: HistoryState
	tier: number
	revenueOf: (nation: number) => number
}
