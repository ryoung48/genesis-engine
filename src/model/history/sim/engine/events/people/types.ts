import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface PeopleEventParams {
	state: HistoryState
	rng: SharedRng
}

export interface EndEarlyParams {
	state: HistoryState
	person: number
}
