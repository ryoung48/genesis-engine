import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface SeatParams {
	state: HistoryState
	seat: number
}

export interface ApplyDerivedParentsParams {
	state: HistoryState
	nation: number
	members: number[]
}

export interface Founding {
	tier: number
	children: number[]
}

export interface ElectFoundingParams {
	state: HistoryState
	nation: number
	rng: SharedRng
	permits: (tier: number) => boolean
	// The tiers the realm qualifies at, lowest first.
	qualified: Founding[]
}

export interface QualifyingParams {
	state: HistoryState
}

export interface FoundParams {
	state: HistoryState
	nation: number
	founding: Founding
}

export interface DissolveLapsedParams {
	state: HistoryState
	nation: number
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

export interface OwnedChildCountParams extends DissolveLapsedParams {
	title: number
}

export interface RefreshHouseholdsParams {
	state: HistoryState
	previousRanks: ArrayLike<number>
}

export interface TopTierParams {
	state: HistoryState
	realm: number
}
