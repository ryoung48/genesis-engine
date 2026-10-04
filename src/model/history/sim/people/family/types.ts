import type { PeopleState } from "@/model/history/sim/people/types"

export interface ScopeParams {
	people: PeopleState
	time: number
	rulers: number[]
}
