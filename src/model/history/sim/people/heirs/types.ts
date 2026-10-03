import type {
	GenderPreference,
	PeopleState,
} from "@/model/history/sim/people/types"

export type HeirRelation = "child" | "sibling" | "relative" | "none"

export interface HeirsOfParams {
	people: PeopleState
	dying: number
	time: number
	preference: GenderPreference
	eligible: (person: number) => boolean
}

export interface HeirResult {
	heir: number
	relation: HeirRelation
}

export type HeirLineParams = HeirsOfParams

// One child of the late ruler and the first eligible person of their line; -1
// when the line has nobody.
export interface HeirBranch {
	branch: number
	heir: number
}

export interface LineBase {
	people: PeopleState
	time: number
	preference: GenderPreference
	eligible: (person: number) => boolean
	seen: Set<number>
}

export interface LineParams extends LineBase {
	person: number
}

export interface AmongParams extends LineBase {
	persons: number[]
}

export interface OrderedParams {
	people: PeopleState
	persons: number[]
	preference: GenderPreference
}

export interface SiblingsParams {
	people: PeopleState
	person: number
	preference: GenderPreference
}
