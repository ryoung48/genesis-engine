import type { RulerRef } from "@/model/history/record/rulers/types"
import type { HistoryRecord } from "@/model/history/record/types"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type {
	AnchorIndex,
	Lineage,
	Placement,
	RulerFact,
	TieRecord,
} from "@/model/people/anchors/types"
import type { Character } from "@/model/people/character/types"
import type { ReligionDoctrine } from "@/model/people/doctrine/types"
import type { Life } from "@/model/people/health/types"
import type { LanguageNames } from "@/model/society/language/names"

export type PersonId = number
export type MarriageId = number

export interface PeopleGeography {
	provinceAdjOffset: Int32Array
	provinceAdjList: Int32Array
	locationProvince: Int32Array
	locationCount: number
}

export interface PeopleContext {
	// [JUSTIFICATION] Worlds without province data have no seats.
	geography: PeopleGeography | null
	frameAt: (timeMs: number) => WorldFrame
	// [JUSTIFICATION] Worlds without religions have no doctrines.
	doctrine: ReligionDoctrine | null
}

export type Parents =
	| { kind: "couple"; marriage: MarriageId }
	| { kind: "none"; reason: "conjured" | "unrecorded" }

export type RulerLink = { kind: "ruler"; ref: RulerRef } | { kind: "none" }

export interface LifeInputs {
	survivesMs: number
	// [JUSTIFICATION] Only a recorded natural death or a living ruler fixes the death.
	fixedDeathMs: number | null
	// [JUSTIFICATION] Only a mother who dies in childbirth overrides the drawn cause.
	forcedCause: string | null
}

export type RowPart = string | { person: PersonId }

export interface PersonRow {
	timeMs: number
	type: string
	parts: RowPart[]
	revealed: boolean
}

export interface PersonNames {
	name: string
	house: string | null
}

export interface SearchState {
	cursorMs: number
	betrothAge: number
	pluralAge: number
	found: number
}

export interface Person {
	id: PersonId
	sex: number
	birthMs: number
	house: boolean
	dynasty: number
	dynastyOrigin: number
	home: number
	ruler: RulerLink
	// Noble rank: -2 inherits from the parents, -1 lowborn, 0 baron to 5 hegemon.
	tier: number
	// Province of residence; -2 inherits from the parents.
	seat: number
	parents: Parents
	character: Character
	life: Life
	inputs: LifeInputs
	lifeUntilMs: number
	search: SearchState
	marriages: MarriageId[]
	generatedUntil: number
	rows: PersonRow[]
	revealedLater: boolean
	// [JUSTIFICATION] Names are resolved on the first page that shows the person.
	names: PersonNames | null
}

export type PregnancyOutcome =
	| "birth"
	| "miscarriage"
	| "stillbirth"
	| "childbirth death"

export interface Pregnancy {
	conceptionMs: number
	dueMs: number
	outcome: PregnancyOutcome
	twins: boolean
	planned: boolean
	children: PersonId[]
}

export interface MarriageChild {
	id: PersonId
	birthMs: number
	planned: boolean
}

export type Kinship = "sibling" | "half-sibling" | "uncle-niece" | "cousin"

export type MarriageKind =
	| "origin"
	| "free"
	| "tie"
	| "plural"
	| "concubine"
	| "gap"

export interface FertilityCursor {
	month: number
	nextFreeMs: number
	closed: boolean
}

export interface Marriage {
	id: MarriageId
	husband: PersonId
	wife: PersonId
	startMs: number
	kind: MarriageKind
	// [JUSTIFICATION] Only a marriage promised in childhood has a betrothal date.
	betrothedMs: number | null
	// [JUSTIFICATION] Only a marriage between relatives has a kinship.
	kinship: Kinship | null
	pregnancies: Pregnancy[]
	children: MarriageChild[]
	cursor: FertilityCursor
	revealedLater: boolean
}

export type ReservationState = "open" | "placed" | "unfit"

export type ReservationSource = "plan" | "kin" | "ladder"

export interface ReservedChild {
	sex: number
	// [JUSTIFICATION] Siblings and daughters take their lineage from the parents that bear them.
	lineage: Lineage | null
	ruler: RulerLink
	survivesMs: number
	tier: number
}

export interface Reservation {
	child: ReservedChild
	birthMs: number
	owner: string
	source: ReservationSource
	state: ReservationState
	placed: PersonId | null
}

export interface CastStats {
	castSpouses: number
	createdSpouses: number
	unrecordedParents: number
	revealedLater: number
	reservedUnfit: number
	deathContradictions: number
}

export interface IngestMark {
	nations: Map<number, number>
	diplomacy: number
}

export interface Cast {
	record: HistoryRecord
	worldSeed: number
	generator: LanguageNames
	// [JUSTIFICATION] The context arrives with the first entry that has world data.
	context: PeopleContext | null
	anchors: AnchorIndex
	persons: Person[]
	marriages: Marriage[]
	bySex: [PersonId[], PersonId[]]
	rulerPerson: Map<number, PersonId>
	reservations: Map<string, Reservation[]>
	reserved: Map<number, Reservation>
	pendingTies: Map<number, TieRecord[]>
	ingested: IngestMark
	horizonMs: number
	houses: Map<string, string>
	namePool: Map<string, string>
	tiers: Map<string, number>
	rings: Map<string, number[]>
	placements: Placement[]
	stats: CastStats
	passedOver: Set<string>
	plans: Map<number, PlanState>
	blocks: Map<number, PlanBlock>
	arrivals: number[]
	unions: UnionNote[]
}

export interface UnionNote {
	successor: number
	late: number
	timeMs: number
}

export interface PlanBlock {
	fromMs: number
	untilMs: number
}

export type PlanState = "open" | "fulfilled" | "cancelled"

export interface OfParams {
	record: HistoryRecord
	context: PeopleContext
}

export interface SnappedFrameParams {
	cast: Cast
	timeMs: number
}

export interface PersonSpec {
	sex: number
	birthMs: number
	lineage: Lineage
	ruler: RulerLink
	tier: number
	seat: number
	parents: Parents
	inputs: LifeInputs
}

export interface AddParams {
	cast: Cast
	spec: PersonSpec
}

export interface PersonParams {
	cast: Cast
	id: PersonId
}

export interface ParentsOfParams {
	cast: Cast
	person: Person
}

export interface AncestorsParams {
	cast: Cast
	id: PersonId
	generations: number
}

export interface LifeDrawParams {
	cast: Cast
	seed: number
	character: Character
	birthMs: number
	sex: number
	inputs: LifeInputs
}

export interface NameSeedParams {
	cast: Cast
	seed: number
	home: number
	sex: number
}

export interface RefreshParams {
	cast: Cast
	fact: RulerFact
}
