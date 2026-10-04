import type { PeopleState } from "@/model/history/sim/people/types"

export type BetrothalEndCause = "death" | "alliance" | "kinship"

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
	onKinship: () => void
}

export interface BetrothedPair {
	a: number
	b: number
}
