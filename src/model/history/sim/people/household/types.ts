import type { PeopleState } from "@/model/history/sim/people/types"

export interface HouseholdContext {
	realmOf: (province: number) => number
	ranks: () => { length: number; [index: number]: number }
	time: () => number
}

export interface ResidenceHistory {
	length: number
	times: Float64Array
	provinces: Int32Array
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
