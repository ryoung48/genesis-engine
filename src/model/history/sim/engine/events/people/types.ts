import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { PeopleMatches } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface PeopleEventParams {
	state: HistoryState
	rng: SharedRng
}

export interface EndEarlyParams {
	state: HistoryState
	person: number
}

export interface StateParams {
	state: HistoryState
}

export interface SettleMatchesParams {
	state: HistoryState
	matches: PeopleMatches
}
