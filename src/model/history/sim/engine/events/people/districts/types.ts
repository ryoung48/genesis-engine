import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface DistrictParams {
	state: HistoryState
	rng: SharedRng
}

export interface SeatParams {
	state: HistoryState
	seat: number
}

export interface HolderParams {
	state: HistoryState
	seat: number
	relativeFirst: boolean
	rng: SharedRng
}

export interface GrantCandidate {
	seat: number
	key: number
}

export interface InstallDistrictParams {
	state: HistoryState
	seat: number
	person: number
}
