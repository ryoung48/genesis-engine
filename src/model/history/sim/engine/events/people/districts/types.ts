import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SeatChangeReason } from "@/model/history/sim/people/types"
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
	reason: SeatChangeReason
}

export interface RevalidateParams {
	state: HistoryState
	seats: number[]
}

// "vacated": no longer a district seat, holder removed. "kept": a living
// holder sits there. "lapsed": a valid seat whose holder died or moved on.
export type SeatStanding = "vacated" | "kept" | "lapsed"

export interface SeatCheck {
	seat: number
	holder: number
	standing: SeatStanding
}

export interface SucceedDistrictParams extends DistrictParams {
	seat: number
}
