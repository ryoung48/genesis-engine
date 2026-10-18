import type {
	RulerKin,
	RulerRef,
	RulerRelation,
} from "@/model/history/record/rulers/types"
import type { HistoryRecord } from "@/model/history/record/types"
import type { PersonKey } from "@/model/people/keys/types"

export interface RulerReign {
	rulerId: number
	nationId: number
	startMs: number
	endMs: number
	open: boolean
}

export interface RulerFact {
	key: PersonKey
	rulerId: number
	ref: RulerRef
	birthMs: number
	accessionMs: number
	fixedDeathMs: number | null
	survivesMs: number
	deathCause: "natural" | "deposed" | null
	// [JUSTIFICATION] Founders, appointees and usurpers record no kin.
	kin: RulerKin | null
	reigns: RulerReign[]
}

export interface Lineage {
	house: boolean
	dynasty: number
	dynastyOrigin: number
	home: number
}

export interface InjectedPerson extends Lineage {
	key: PersonKey
	sex: number
	birthMs: number
	survivesMs: number
	noParentCharacter: boolean
}

export interface AnchoredChild {
	key: PersonKey
	birthMs: number
}

export interface AnchoredTie {
	startMs: number
	endMs: number
}

export interface AnchoredCouple {
	id: string
	father: PersonKey
	mother: PersonKey
	children: AnchoredChild[]
	// [JUSTIFICATION] Only a royal-marriage tie carries a recorded wedding span.
	tie: AnchoredTie | null
}

export type PlacementStep =
	| "son"
	| "brother"
	| "nephew"
	| "uncle"
	| "cousin"
	| "grandson"
	| "sisterSon"
	| "unknown"

export interface Placement {
	rulerId: number
	requested: RulerRelation
	step: PlacementStep
	first: boolean
}

export interface TieRecord {
	timeMs: number
	first: number
	second: number
	filled: boolean
	rule: number
}

export interface AnchorIndex {
	worldSeed: number
	horizonMs: number
	facts: Map<number, RulerFact>
	nationReigns: Map<number, RulerReign[]>
	injected: Map<PersonKey, InjectedPerson>
	couples: Map<string, AnchoredCouple>
	parentCouple: Map<PersonKey, string>
	spouseCouples: Map<PersonKey, string[]>
	placements: Placement[]
	ties: TieRecord[]
	indexMs: number
}

export interface BuildIndexParams {
	record: HistoryRecord
	worldSeed: number
}

export interface IndexPersonParams {
	index: AnchorIndex
	key: PersonKey
}

export interface ChildInfo extends Lineage {
	birthMs: number
	sex: number
}

export interface ParentCoupleParams {
	index: AnchorIndex
	key: PersonKey
	info: ChildInfo
}

export interface NewCoupleParams {
	index: AnchorIndex
	id: string
	father: PersonKey
	mother: PersonKey
	tie: AnchoredTie | null
}

export interface JoinParams {
	index: AnchorIndex
	couple: AnchoredCouple
	child: PersonKey
	birthMs: number
}

export interface WindowParams {
	index: AnchorIndex
	couple: AnchoredCouple
}

export interface BirthWindow {
	lo: number
	hi: number
}

export interface InjectParams {
	index: AnchorIndex
	anchor: string
	role: string
	sex: number
	birthMs: number
	lineage: Lineage
	noParentCharacter: boolean
	survivesMs: number
}

export interface ChildCoupleParams {
	index: AnchorIndex
	parent: PersonKey
	anchor: string
}

export interface CoupleStartParams {
	index: AnchorIndex
	couple: AnchoredCouple
}

export interface FactsResult {
	facts: Map<number, RulerFact>
	nationReigns: Map<number, RulerReign[]>
}

export interface PlaceParams {
	index: AnchorIndex
	fact: RulerFact
}

export interface TieEvent {
	timeMs: number
	first: number
	second: number
	endMs: number
}

export interface PlaceTieParams {
	index: AnchorIndex
	tie: TieEvent
	ordinal: number
}

export interface SpanParams {
	index: AnchorIndex
	key: PersonKey
}

export interface BirthOfParams {
	index: AnchorIndex
	key: PersonKey
}

export interface AliveBoundParams {
	index: AnchorIndex
	key: PersonKey
}

export interface RaiseSurvivesParams {
	index: AnchorIndex
	key: PersonKey
	timeMs: number
}
