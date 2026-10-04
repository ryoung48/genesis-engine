import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type {
	PeopleRandomSource,
	SeatChangeReason,
} from "@/model/history/sim/people/types"

export interface DistrictParams {
	state: HistoryState
	rng: PeopleRandomSource
}

export interface SeatParams {
	state: HistoryState
	seat: number
}

export interface GrantParams extends DistrictParams {
	found: ((seat: number) => number) | null
	randomOf: ((seat: number) => PeopleRandomSource) | null
}

export interface HolderParams {
	found: ((seat: number) => number) | null
	state: HistoryState
	seat: number
	relativeFirst: boolean
	rng: PeopleRandomSource
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
