import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { DeathCause } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface InitSuccessionParams {
	state: HistoryState
}

export interface RunSeatSuccessionParams {
	state: HistoryState
	province: number
	leaderIdx: number
	rng: SharedRng
}

export interface RunYearParams {
	state: HistoryState
	rng: SharedRng
}

export interface PretenderParams {
	state: HistoryState
	realm: number
	seat: number
	supportingSeats: number[]
	supportingHolders: number[]
	seatHolder: number
	pretender: number
	// A deposed ruler's line pressing its claim.
	restoration: boolean
	rng: SharedRng
}

export interface RealmParams {
	state: HistoryState
	realm: number
}

export interface RealmRngParams {
	state: HistoryState
	realm: number
	rng: SharedRng
}

export interface WeakCrownParams {
	state: HistoryState
	realm: number
	claim: number
	rng: SharedRng
}

// One death's seat walk. Each union edge advances at most once per walk.
export interface SuccessionContext {
	accountedEdges: Set<string>
	cause: DeathCause
}

export interface SucceedPersonParams {
	state: HistoryState
	person: number
	context: SuccessionContext
	rng: SharedRng
}
