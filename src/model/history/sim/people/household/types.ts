import type { MarriageLaw } from "@/model/history/sim/people/marriage-law/types"
import type { PeopleState } from "@/model/history/sim/people/types"

export interface HouseholdContext {
	lawOfRealm: (realm: number) => MarriageLaw
	heritageOfCulture: (culture: number) => number
	religionOfRealm: (realm: number) => number
	realmOf: (province: number) => number
	ranks: () => { length: number; [index: number]: number }
	time: () => number
}

// Every move in one set of columns; each row points at the same person's
// previous move, and `head` holds each person's latest row.
export interface ResidenceHistory {
	head: Map<number, number>
	length: number
	times: Float64Array
	provinces: Int32Array
	previous: Int32Array
}

export interface HouseholdPersonParams {
	people: PeopleState
	person: number
}

export interface ResidenceAtParams extends HouseholdPersonParams {
	time: number
}

export interface RelocateParams extends ResidenceAtParams {
	province: number
}

export interface WeddingResidenceParams {
	people: PeopleState
	a: number
	b: number
	time: number
}

export interface InitialResidenceParams extends HouseholdPersonParams {
	province: number
}
