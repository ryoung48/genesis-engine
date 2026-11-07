import type { HistoryRecord } from "@/model/history/record/types"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type {
	Cast,
	Kinship,
	PeopleContext,
	Person,
	UnionNote,
} from "@/model/people/cast/types"
import type {
	CongenitalTrait,
	GradeTrait,
	PersonalityTrait,
} from "@/model/people/character/types"
import type { HealthBand } from "@/model/people/health/types"
import type { OpinionBreakdown } from "@/model/people/opinion/types"
import type { Orientation } from "@/model/people/orientation/types"

export type PersonKey = string

export interface OpenParams {
	record: HistoryRecord
	context: PeopleContext
}

export interface PageParams {
	record: HistoryRecord
	context: PeopleContext
	key: PersonKey
	timeMs: number
}

export interface FamilyMember {
	// [JUSTIFICATION] Only a spouse who is a blood relative has a kinship.
	kinship: Kinship | null
	key: PersonKey
	name: string
	house: string | null
	female: boolean
	ageYears: number
	status: HealthBand | "Dead"
	// [JUSTIFICATION] The dead hold no opinion that the page can show.
	opinion: OpinionBreakdown | null
	revealed: boolean
}

export interface FamilyGroup {
	label: string
	members: FamilyMember[]
}

export interface PersonRef {
	key: PersonKey
	name: string
}

export interface TimelineRow {
	timeMs: number
	type: string
	text: string
	people: PersonRef[]
	revealed: boolean
}

export interface Describer {
	row: (
		timeMs: number,
		type: string,
		parts: Array<string | Person>,
		revealed?: boolean,
	) => TimelineRow
}

export interface ConditionView {
	name: string
	level: number
}

export interface PersonPage {
	key: PersonKey
	name: string
	house: string | null
	female: boolean
	birthMs: number
	ageYears: number
	status: HealthBand | "Dead"
	deathMs: number
	// [JUSTIFICATION] Only rulers, princes and princesses hold a title.
	title: string | null
	// [JUSTIFICATION] A home province without culture data has none.
	culture: string | null
	cultureKey: string | null
	religionId: number
	rank: string
	seatProvince: number
	religionKey: string | null
	// [JUSTIFICATION] A home province without religion data has none.
	religion: string | null
	// [JUSTIFICATION] Orientation is shown from age 18.
	orientation: Orientation | null
	personality: PersonalityTrait[]
	grades: GradeTrait[]
	congenital: CongenitalTrait[]
	conditions: ConditionView[]
	groups: FamilyGroup[]
	timeline: TimelineRow[]
	revealed: boolean
}

export interface PersonHeader {
	name: string
	birthMs: number
}

export type PageOutcome =
	| { kind: "page"; page: PersonPage }
	| { kind: "unborn"; header: PersonHeader }
	| { kind: "pending"; header: PersonHeader }

export interface MemberParams {
	cast: Cast
	context: PeopleContext
	subject: Person
	person: Person
	timeMs: number
	frame: WorldFrame
	kin: boolean
	spouse: boolean
}

export interface TitleParams {
	cast: Cast
	person: Person
	parents: Person[]
	timeMs: number
	frame: WorldFrame
}

export interface SpouseEntry {
	person: Person
	current: boolean
	betrothed: boolean
	concubine: boolean
	kinship: Kinship | null
}

export interface RelativesResult {
	parents: Person[]
	fullSiblings: Person[]
	halfSiblings: Person[]
	spouses: SpouseEntry[]
	children: Person[]
}

export interface PassedOver {
	timeMs: number
	successorRulerId: number
}

export interface PassedOverParams {
	cast: Cast
	person: Person
	timeMs: number
}

export interface ViewParams {
	cast: Cast
	context: PeopleContext
	person: Person
	timeMs: number
	frame: WorldFrame
}

export interface TimelineParams {
	cast: Cast
	person: Person
	timeMs: number
	found: RelativesResult
}

export interface GroupsParams {
	cast: Cast
	context: PeopleContext
	subject: Person
	timeMs: number
	frame: WorldFrame
	found: RelativesResult
}

export interface RelationsParams {
	found: RelativesResult
}

export interface UnionLinkParams {
	cast: Cast
	person: Person
	union: UnionNote
}
