import type { PeopleState, RealmOrigin } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type PregnancyOutcome =
	| "birth"
	| "miscarriage"
	| "stillbirth"
	| "mother dies"
	| "mother and child die"

export interface BearParams {
	people: PeopleState
	mother: number
	father: number
	from: number
	until: number
	// The mother is known to live until then, so no pregnancy may kill her
	// earlier.
	survives: number
	origin: RealmOrigin
	rng: SharedRng
}

export interface SiblingsParams {
	people: PeopleState
	child: number
	until: number
	origin: RealmOrigin
	rng: SharedRng
}

export interface CoupleParams {
	people: PeopleState
	mother: number
	father: number
}

export interface CoupleAtParams extends CoupleParams {
	time: number
}

export interface OutcomeParams {
	people: PeopleState
	mother: number
	time: number
	// Children the mother has already borne.
	earlier: number
	rng: SharedRng
}

export interface DurationParams {
	outcome: PregnancyOutcome
	rng: SharedRng
}

export interface ChildCount {
	// Births to the mother by any father.
	earlier: number
	// The couple's children, born and still living.
	together: number
	living: number
}

export interface TwinChanceParams {
	people: PeopleState
	mother: number
	age: number
}

export interface WomanParams {
	people: PeopleState
	woman: number
}

export interface DeliverParams {
	people: PeopleState
	mother: number
	father: number
	due: number
	twins: boolean
	origin: RealmOrigin
	rng: SharedRng
}

export interface ChildDynastyParams {
	people: PeopleState
	mother: number
	father: number
	origin: RealmOrigin
}
