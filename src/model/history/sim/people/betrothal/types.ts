import type { PeopleState } from "@/model/history/sim/people/types"

export type BetrothalEndCause = "death" | "alliance"

export interface BetrothParams {
	people: PeopleState
	a: number
	b: number
	time: number
}

export interface ReleaseParams {
	people: PeopleState
	person: number
	time: number
	cause: BetrothalEndCause
}

export interface BetrothalPassParams {
	people: PeopleState
	time: number
}

export interface BetrothedPair {
	a: number
	b: number
}
