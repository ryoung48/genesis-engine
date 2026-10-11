import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RealmRegencyParams {
	state: HistoryState
	realm: number
}

export interface ComeOfAgeParams {
	state: HistoryState
	realm: number
	leader: number
	rng: SharedRng
}
