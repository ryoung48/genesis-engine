import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SeatChangeReason } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface SeizeParams {
	state: HistoryState
	realm: number
	person: number
	claim: number
	deposed: number
	reason: SeatChangeReason
}

export interface SeeksParams {
	state: HistoryState
	realm: number
	holder: number
	rng: SharedRng
}

export interface EnthroneParams {
	state: HistoryState
	war: War
	claimant: number
	claim: number
	deposed: number
	rng: SharedRng
}
