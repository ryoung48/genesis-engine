import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type SuccessionLaw =
	| "confederate"
	| "partition"
	| "high_partition"
	| "single_heir"

export type GenderLaw = "male_preference" | "equal" | "female_preference"

export interface InitLawsParams {
	state: HistoryState
	seed: number
}

export interface NewSovereignLawParams {
	state: HistoryState
	nation: number
	former: number
}

export interface LawOfParams {
	state: HistoryState
	nation: number
}

export interface ClimbLawsParams {
	state: HistoryState
	rng: SharedRng
}
