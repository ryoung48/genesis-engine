import type { Ruler } from "@/model/history/sim/engine/state/rulers/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface PairParams {
	state: HistoryState
	a: number
	b: number
}

export interface RealmParams {
	state: HistoryState
	realm: number
}

export interface StateParams {
	state: HistoryState
}

export interface RunYearParams {
	state: HistoryState
	rng: SharedRng
}

export interface TieChanceParams {
	state: HistoryState
	realm: number
}

export interface MarriagePartner {
	realm: number
	ruler: Ruler
	claim: number
}
