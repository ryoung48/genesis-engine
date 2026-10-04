import type { MarriageObservation } from "@/model/history/sim/people/family/diagnostics/types"
import type { MarriageCandidateContext } from "@/model/history/sim/people/family/match-scoring/types"
import type {
	OpinionContext,
	OpinionPerson,
} from "@/model/history/sim/people/opinion/types"
import type {
	MarriageRealms,
	PeopleState,
	Sex,
} from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface MarriageFixture {
	people: PeopleState
	time: number
	rng: SharedRng
	market: MarriageRealms
	context: OpinionContext
	persons: Map<number, OpinionPerson>
	candidates: Map<number, MarriageCandidateContext>
	observations: MarriageObservation[]
}

export interface AddMarriagePersonParams {
	fixture: MarriageFixture
	age: number
	sex: Sex
	realm: number
}
