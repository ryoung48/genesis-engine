import type { HistoryRng } from "@/model/history/generated/history-rng/types"
import type { HistoryState } from "@/model/history/generated/state/types"

export interface InitSuccessionParams {
	state: HistoryState
}

export interface ClaimParams {
	state: HistoryState
	p: number
	rng: HistoryRng
}

export interface RegencyParams {
	state: HistoryState
	p: number
}

export interface RunSuccessionParams {
	state: HistoryState
	province: number
	leaderIdx: number
	rng: HistoryRng
}
