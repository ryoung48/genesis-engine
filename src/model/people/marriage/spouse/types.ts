import type { Cast, Person } from "@/model/people/cast/types"
import type { ConjuredSpouse, Seat } from "@/model/people/nobility/types"

export interface ChooseParams {
	cast: Cast
	owner: Person
	startMs: number
	spouseBirthMs: number
	betrothedMs: number | null
	forced: boolean
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

export interface FamilyParams {
	cast: Cast
	seat: Seat
	nationId: number
	focusNation: number
	timeMs: number
}

export interface SeatOption {
	seat: Seat
	nationId: number
}

export interface SeatOptionsParams {
	cast: Cast
	nations: number[]
	tier: number
	owner: Person
	startMs: number
}

export interface FreeParams {
	cast: Cast
	person: Person
	fromMs: number
}
