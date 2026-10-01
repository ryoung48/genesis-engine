import type {
	PeopleRecord,
	RecordPerson,
} from "@/model/history/record/people/types"
import type { HistoryComment } from "@/model/history/record/types"
import type { LanguageNames } from "@/model/society/language/names"

export interface PersonNames {
	name: string
	house: string | null
	female: boolean
}

export interface NamedPerson extends RecordPerson, PersonNames {}

export interface NameContext {
	generator: LanguageNames
	cache: Map<number, PersonNames>
}

export interface InitializeNamesParams {
	people: PeopleRecord
	generator: LanguageNames
}

export interface PersonNamesParams {
	people: PeopleRecord | null
	person: number
}

export interface PersonPayloadParams {
	people: PeopleRecord | null
	payload: Record<string, unknown>
}

export interface PersonCommentParams {
	people: PeopleRecord | null
	comment: HistoryComment
}
