import type { HistoryState } from "@/model/history/record/types"
import type { ReligionDoctrine } from "@/model/people/doctrine/types"
import type { PeopleGeography } from "@/model/people/store/types"
import type { CreateEngineParams } from "@/test/history-run/types"

export interface PeopleInputParams {
	history: CreateEngineParams
	years: number
	fresh: boolean
}

export interface PeopleInput {
	state: HistoryState
	seed: number
	startYear: number
	doctrine: ReligionDoctrine | null
	geography: PeopleGeography | null
	generationMs: number
	historyMs: number
}
