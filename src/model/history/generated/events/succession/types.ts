import type { SharedRng } from "@/model/shared/random/rng"
import type { HistoryState } from "@/model/history/generated/state/types"

export interface InitSuccessionParams {
	state: HistoryState
}

export interface ClaimParams {
	state: HistoryState
	p: number
	rng: SharedRng
}

export interface RegencyParams {
	state: HistoryState
	p: number
}

export interface RunSuccessionParams {
	state: HistoryState
	province: number
	leaderIdx: number
	rng: SharedRng
}
