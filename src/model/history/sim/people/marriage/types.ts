import type { PeopleState } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type MarriageKind = "primary" | "secondary" | "concubine"
export type MarriageEndReason = "widowed" | "divorced"

export interface MarryParams {
	people: PeopleState
	husband: number
	wife: number
	time: number
	// [JUSTIFICATION] The data supports later marriage doctrines, though this pass only creates primary rows.
	kind?: MarriageKind
}

export interface MarriageAtParams {
	people: PeopleState
	person: number
	time: number
}

export interface EndMarriageParams {
	people: PeopleState
	marriage: number
	time: number
	reason: MarriageEndReason
}

export interface MarketParams {
	people: PeopleState
	from: number
	sovereignOfResidence: Int32Array
	cultureOfResidence: Int16Array | Int32Array
	standing: Uint8Array
	neighbors: Map<number, readonly number[]>
	rng: SharedRng
}

export interface MarketResult {
	weddings: Wedding[]
	arrivals: number[]
}

export interface Wedding {
	husband: number
	wife: number
	time: number
}

export interface MarriageCandidate {
	husband: number
	wife: number
	score: number
}
