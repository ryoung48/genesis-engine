import type { PeopleState } from "@/model/history/sim/people/types"
export type ConsanguinityBar =
	| "restricted"
	| "cousins"
	| "aunt_nephew_and_uncle_niece"
	| "unrestricted"
export interface MarriageLaw {
	consort: "none" | "wife" | "concubine"
	consortMax: number
	bar: ConsanguinityBar
}
export interface PermitsParams {
	people: PeopleState
	a: number
	b: number
	cache: Map<number, Map<number, number>> | null
}
