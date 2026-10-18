import type { HistoryState } from "@/model/history/record/types"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type { ReligionDoctrine } from "@/model/people/doctrine/types"
import type { PeopleGeography, PeopleStore } from "@/model/people/store/types"

export interface PeopleFixtureParams {
	years: number
	points: number
}

export interface PeopleFixture {
	state: HistoryState
	store: PeopleStore
	frameAt: (timeMs: number) => WorldFrame
	seed: number
	doctrine: ReligionDoctrine | null
	geography: PeopleGeography | null
}
