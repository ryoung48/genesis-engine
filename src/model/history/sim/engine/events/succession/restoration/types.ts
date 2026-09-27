import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface DeposeParams {
	state: HistoryState
	realm: number
	claimant: number
}

export interface AttemptParams {
	state: HistoryState
	realm: number
	rng: SharedRng
}

// A backed restoration: the district seat that rises for the claimant.
export interface RestorationRevolt {
	claimant: number
	seat: number
}

export interface DueParams {
	state: HistoryState
}

export interface LapseParams {
	state: HistoryState
	realm: number
	claimant: number
}
