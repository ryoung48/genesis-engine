import type { WorldFrame } from "@/model/history/world-frame/types"
import type {
	CongenitalTrait,
	GradeTrait,
	PersonalityTrait,
} from "@/model/people/character/types"
import type { ReligionDoctrine } from "@/model/people/doctrine/types"
import type { HealthBand } from "@/model/people/health/types"
import type { PersonKey } from "@/model/people/keys/types"
import type { Kinship } from "@/model/people/marriage/types"
import type { OpinionBreakdown } from "@/model/people/opinion/types"
import type { Orientation } from "@/model/people/orientation/types"
import type { PeopleGeography, PeopleStore } from "@/model/people/store/types"
import type { PersonStub } from "@/model/people/stub/types"

export interface PersonQueryParams {
	store: PeopleStore
	key: PersonKey
	timeMs: number
	frameAt: (timeMs: number) => WorldFrame
	// [JUSTIFICATION] Worlds without religions have no doctrines.
	doctrine: ReligionDoctrine | null
	// [JUSTIFICATION] Worlds without province data have no seats.
	geography: PeopleGeography | null
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
}

export interface Describer {
	row: (
		timeMs: number,
		type: string,
		parts: Array<string | PersonStub>,
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
}

export interface MemberParams {
	store: PeopleStore
	subject: PersonStub
	stub: PersonStub
	timeMs: number
	frame: WorldFrame
	kin: boolean
	spouse: boolean
}

export interface TitleParams {
	store: PeopleStore
	stub: PersonStub
	parents: PersonStub[]
	timeMs: number
	frame: WorldFrame
}

export interface RelativesResult {
	parents: PersonStub[]
	fullSiblings: PersonStub[]
	halfSiblings: PersonStub[]
	spouses: Array<{
		stub: PersonStub
		current: boolean
		betrothed: boolean
		concubine: boolean
		kinship: Kinship | null
	}>
	children: PersonStub[]
	grandparents: PersonStub[]
	auncles: PersonStub[]
	cousins: PersonStub[]
	nephews: PersonStub[]
}

export interface HeaderParams {
	store: PeopleStore
	key: PersonKey
}

export interface PersonHeader {
	name: string
	birthMs: number
}
