import type { Cast, Person } from "@/model/people/cast/types"
import type { ConjuredSpouse } from "@/model/people/nobility/types"

export interface ChooseParams {
	cast: Cast
	owner: Person
	startMs: number
	spouseBirthMs: number
	betrothedMs: number | null
}

export interface CandidateParams {
	cast: Cast
	owner: Person
	startMs: number
	fromMs: number
	tier: number
	realms: Set<number>
}

export interface ConjureParams {
	cast: Cast
	owner: Person
	profile: ConjuredSpouse
	spouseBirthMs: number
	startMs: number
}

export interface FreeParams {
	cast: Cast
	person: Person
	fromMs: number
}
