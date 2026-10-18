import type {
	RulerKin,
	RulerRef,
	RulerRelation,
} from "@/model/history/record/rulers/types"
import type { HistoryRecord } from "@/model/history/record/types"

export interface RulerReign {
	rulerId: number
	nationId: number
	startMs: number
	endMs: number
	open: boolean
	settled: boolean
}

export interface DeathNote {
	deathMs: number
	cause: "natural" | "deposed"
}

export interface RulerFact {
	rulerId: number
	ref: RulerRef
	birthMs: number
	accessionMs: number
	fixedDeathMs: number | null
	survivesMs: number
	deathCause: "natural" | "deposed" | null
	// [JUSTIFICATION] Founders, appointees and usurpers record no kin.
	kin: RulerKin | null
	// [JUSTIFICATION] A ruler still reigning has no recorded death.
	death: DeathNote | null
	reigns: RulerReign[]
}

export interface Lineage {
	house: boolean
	dynasty: number
	dynastyOrigin: number
	home: number
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

export type TieStatus = "pending" | "filled" | "unfilled"

export interface TieRecord {
	timeMs: number
	first: number
	second: number
	endMs: number
	status: TieStatus
	rule: number
}

export interface AnchorIndex {
	facts: Map<number, RulerFact>
	nationReigns: Map<number, RulerReign[]>
	lastReign: Map<number, RulerReign>
	ties: TieRecord[]
	openTies: Map<string, TieRecord>
	dirty: Set<number>
}

export interface AddRulerParams {
	index: AnchorIndex
	nationId: number
	timeMs: number
	payload: Record<string, unknown>
}

export interface AddResult {
	fact: RulerFact
	created: boolean
	entered: boolean
	kin: RulerKin | null
}

export interface SettleParams {
	index: AnchorIndex
	record: HistoryRecord
}

export interface AddTieParams {
	index: AnchorIndex
	timeMs: number
	first: number
	second: number
}

export interface EndTieParams {
	index: AnchorIndex
	timeMs: number
	first: number
	second: number
}

export interface RulerAtParams {
	index: AnchorIndex
	nationId: number
	timeMs: number
}

export interface ReignAtParams {
	fact: RulerFact
	timeMs: number
}
