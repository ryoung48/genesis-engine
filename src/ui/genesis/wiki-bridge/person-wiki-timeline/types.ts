import type { PersonTimelineRow } from "@/model/history/record/people/query/timeline/types"
import type { HistoryState } from "@/model/history/record/types"
import type { LanguageNames } from "@/model/society/language/names"
import type { WikiTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"

export type PersonMention = NonNullable<WikiTimelineEvent["people"]>[number]
export type NationMention = WikiTimelineEvent["nations"][number]
export type ProvinceMention = WikiTimelineEvent["provinces"][number]

export interface RealmAtParams {
	seat: number
	timeMs: number
}

export interface PersonTimelineContext {
	personMention: (person: number) => PersonMention
	nationMention: (nationId: number) => NationMention
	provinceMention: (seat: number) => ProvinceMention
	titleLabel: (title: number) => string
	realmAt: (params: RealmAtParams) => number
}

export interface BuildPersonEventsParams {
	rows: PersonTimelineRow[]
	context: PersonTimelineContext
}

export interface RowEvent {
	description: string
	people: PersonMention[]
	nations: NationMention[]
	provinces: ProvinceMention[]
}

export interface DescribeRowParams {
	row: PersonTimelineRow
	context: PersonTimelineContext
}

export interface CreateContextParams {
	state: HistoryState
	names: LanguageNames
	getProvinceColor: (provinceId: number) => string | null
}

export interface PersonContext extends PersonTimelineContext {
	dynastyName: (dynasty: number) => string
	dynastyColor: (dynasty: number) => string
}
