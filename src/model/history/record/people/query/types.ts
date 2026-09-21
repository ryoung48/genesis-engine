import type { HistoryState } from "@/model/history/record/types"
import type { DeathCause } from "@/model/history/sim/people/log/types"
import type { MarriageEndReason } from "@/model/history/sim/people/marriage/types"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type { LanguageNames } from "@/model/society/language/names"

export type DimReason = "unborn" | "dead"

export type PersonStatus = "unborn" | "alive" | "dead"

export type PersonRelation =
	| "father"
	| "mother"
	| "spouse"
	| "child"
	| "sibling"
	| "half-sibling"

export interface PersonRef {
	id: number
	name: string
	sex: 0 | 1
	dynasty: number
	birthMs: number
	// [JUSTIFICATION] A living person has no death date.
	deathMs: number | null
	dimmed: boolean
	// [JUSTIFICATION] A person who is born and alive at the date is not dimmed.
	dimReason: DimReason | null
	relation: PersonRelation
}

export type MarriageState = "active" | "former" | "future"

export interface SpouseMarriage {
	startMs: number
	// [JUSTIFICATION] An ongoing marriage has no end date.
	endMs: number | null
	// [JUSTIFICATION] An ongoing marriage has no end reason.
	reason: MarriageEndReason | null
	state: MarriageState
}

export interface SpouseRef extends PersonRef {
	marriage: SpouseMarriage
}

export interface TitleRef {
	title: number
	tier: number
	seat: number
	// [JUSTIFICATION] A title whose seat is in no nation has no realm to link.
	realmNationId: number | null
}

export interface Tenure {
	seat: number
	startMs: number
	// [JUSTIFICATION] A tenure still running has no end date.
	endMs: number | null
	sinceRecordStart: boolean
	// [JUSTIFICATION] A seat that belonged to no nation has no realm to link.
	realmNationId: number | null
}

export interface PersonPage {
	id: number
	name: string
	sex: 0 | 1
	status: PersonStatus
	culture: number
	dynasty: number
	dynastyName: string
	ageYears: number
	birthMs: number
	// [JUSTIFICATION] A living person has no death date.
	deathMs: number | null
	// [JUSTIFICATION] A living person has no cause of death.
	deathCause: DeathCause | null
	healthBand: number
	// [JUSTIFICATION] A band that began before the record has no known start.
	healthSinceMs: number | null
	// [JUSTIFICATION] Only the dead have a known exact health.
	deathHealth: number | null
	titles: TitleRef[]
	tenures: Tenure[]
	parents: PersonRef[]
	spouses: SpouseRef[]
	children: PersonRef[]
	siblings: PersonRef[]
}

export interface PersonPageParams {
	state: HistoryState
	frame: WorldFrame
	names: LanguageNames
	person: number
	timeMs: number
}

export interface PersonRefParams {
	state: HistoryState
	names: LanguageNames
	person: number
	timeMs: number
	relation: PersonRelation
}

export interface PersonAtParams {
	state: HistoryState
	person: number
	timeMs: number
}

export interface HealthAt {
	band: number
	// [JUSTIFICATION] A band that began before the record has no known start.
	sinceMs: number | null
}

export interface SiblingsParams {
	state: HistoryState
	names: LanguageNames
	person: number
	timeMs: number
}

export interface SpousesParams extends SiblingsParams {}

export interface TitlesAtParams {
	state: HistoryState
	frame: WorldFrame
	person: number
	timeMs: number
}
