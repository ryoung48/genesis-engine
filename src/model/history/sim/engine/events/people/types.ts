import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { PeopleMatches } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface InitPeopleParams {
	state: HistoryState
	seed: number
}

export interface PeopleEventParams {
	state: HistoryState
	rng: SharedRng
}

export interface FailHeartsParams {
	state: HistoryState
	// Rulers whose heart failed this year, in person order.
	hearts: number[]
	rng: SharedRng
}

export interface StateParams {
	state: HistoryState
}

export interface SettleMatchesParams {
	state: HistoryState
	matches: PeopleMatches
}
