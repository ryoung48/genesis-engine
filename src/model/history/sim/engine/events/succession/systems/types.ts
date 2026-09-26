import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface ChooseParams {
	state: HistoryState
	realm: number
	dying: number
	rng: SharedRng
}

export interface SuccessionChoice {
	// -1 founds a new house.
	heir: number
	claim: number
	// District seat of a losing claimant who rises as pretender, or -1.
	pretenderSeat: number
}

export interface Elector {
	person: number
	weight: number
}

export interface Candidate {
	person: number
	seat: number
	strength: number
}

export interface TallyParams {
	state: HistoryState
	electors: Elector[]
	candidates: Candidate[]
	republic: boolean
}

export interface PersonParams {
	state: HistoryState
	person: number
}

export interface ElectableParams {
	state: HistoryState
	realm: number
	person: number
}

export interface MarriageTieParams {
	state: HistoryState
	a: number
	b: number
}

export interface RealmParams {
	state: HistoryState
	realm: number
}

export interface CandidateParams {
	state: HistoryState
	person: number
	seat: number
	totalWeight: number
	weight: number
}

export interface ContestParams {
	state: HistoryState
	realm: number
	heir: Candidate
	rival: Candidate
	rng: SharedRng
}

export interface TallyResult {
	votes: number[]
	// Index of the candidate each elector backed, in elector order.
	choices: number[]
}
