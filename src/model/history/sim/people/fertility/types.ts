import type { PeopleState } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type PregnancyOutcome =
	| "smooth"
	| "early_end"
	| "child_dies"
	| "mother_dies"
	| "mother_and_child_die"

export interface Pregnancy {
	mother: number
	father: number
	conception: number
	due: number
	outcome: PregnancyOutcome
	twins: boolean
}

export interface FamilyBetweenParams {
	people: PeopleState
	mother: number
	father: number
	from: number
	to: number
	standing: number
	ruler: boolean
	rng: SharedRng
}

export interface BirthParams {
	people: PeopleState
	pregnancy: Pregnancy
	rng: SharedRng
}

export interface BirthResult {
	children: number[]
	motherDied: boolean
}

export interface AgeFactorParams {
	age: number
	female: boolean
}

export interface OutcomeParams {
	mother: number
	people: PeopleState
	rng: SharedRng
}

export interface TwinChanceParams {
	mother: number
	people: PeopleState
	age: number
}
