import type { PeopleState } from "@/model/history/sim/people/types"

export interface BackfillPairParams {
	people: PeopleState
	a: number
	b: number
	time: number
}
