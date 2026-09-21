import type { PeopleState } from "@/model/history/sim/people/types"

export type GenderLaw =
	| "male_only"
	| "male_preference"
	| "equal"
	| "female_preference"
	| "female_only"
export type SuccessionLaw =
	| "confederate"
	| "partition"
	| "high_partition"
	| "single_heir"

export interface HeirsOfParams {
	people: PeopleState
	dying: number
	time: number
	law: SuccessionLaw
	gender: GenderLaw
}

export interface HeirResult {
	primary: number
	juniors: number[]
	order: number[]
}

export interface KinGroupParams {
	people: PeopleState
	person: number
	gender: GenderLaw
}

export interface LineParams extends KinGroupParams {
	time: number
	seen: Set<number>
}

export interface OrderedParams {
	people: PeopleState
	persons: number[]
	gender: GenderLaw
}
