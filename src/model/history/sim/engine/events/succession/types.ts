import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface InitSuccessionParams {
	state: HistoryState
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

export interface PretenderParams {
	state: HistoryState
	realm: number
	seat: number
	rng: SharedRng
}

export interface WeakCrownParams {
	state: HistoryState
	realm: number
	claim: number
	rng: SharedRng
}
