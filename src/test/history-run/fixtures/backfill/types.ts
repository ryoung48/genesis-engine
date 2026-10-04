import type { StartingHouse } from "@/model/history/sim/people/family/starting/anchors/types"
import type { PeopleState } from "@/model/history/sim/people/types"

export interface BackfillFixtureParams {
	seed: number
	genderSystem: number
	age: number
	sovereign: boolean
}

export interface BackfillFixture {
	people: PeopleState
	house: StartingHouse
}
