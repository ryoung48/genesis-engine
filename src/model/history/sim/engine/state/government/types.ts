import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"
import type { GovernmentType } from "@/model/society/types"

export type GovernmentCause =
	| "inherited"
	| "size"
	| "knowledge"
	| "city"
	| "election streak"
	| "house lost"

export interface GovernmentTransition {
	from: GovernmentType
	to: GovernmentType
	cause: GovernmentCause
}

export interface ElectionStreak {
	house: number
	wins: number
}

export interface GovernmentReviewParams {
	state: HistoryState
	realm: number
	provinces: number[]
	rng: SharedRng
}

export interface GovernmentAccessionParams extends GovernmentReviewParams {
	knowledge: number
	elected: boolean
	previousHouse: number
}

export interface GovernmentChangeParams {
	state: HistoryState
	realm: number
	to: GovernmentType
	cause: GovernmentCause
}
