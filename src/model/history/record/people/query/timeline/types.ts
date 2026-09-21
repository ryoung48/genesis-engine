import type { PersonRelation } from "@/model/history/record/people/query/types"
import type { TenureView } from "@/model/history/record/people/types"
import type { HistoryState } from "@/model/history/record/types"
import type { DeathCause } from "@/model/history/sim/people/log/types"

export type PersonTimelineGroup = "life" | "family" | "titles"

interface RowBase {
	id: string
	timeMs: number
}

export interface BornRow extends RowBase {
	group: "life"
	kind: "born"
	// [JUSTIFICATION] Founders and outsiders have no recorded father.
	father: number | null
	// [JUSTIFICATION] Founders and outsiders have no recorded mother.
	mother: number | null
}

export interface HealthDeclinedRow extends RowBase {
	group: "life"
	kind: "health-declined"
	fromBand: number
	toBand: number
}

export interface DiedRow extends RowBase {
	group: "life"
	kind: "died"
	ageYears: number
	deathHealth: number
	cause: DeathCause
	inOffice: boolean
}

export interface MarriedRow extends RowBase {
	group: "family"
	kind: "married"
	spouse: number
}

export interface ChildBornRow extends RowBase {
	group: "family"
	kind: "child-born"
	child: number
}

export interface SiblingBornRow extends RowBase {
	group: "family"
	kind: "sibling-born"
	sibling: number
	relation: "sibling" | "half-sibling"
}

export interface KinDiedRow extends RowBase {
	group: "family"
	kind: "kin-died"
	kin: number
	relation: PersonRelation
}

export interface TenureStartRow extends RowBase {
	group: "titles"
	kind: "tenure-start"
	seat: number
	// [JUSTIFICATION] The first recorded holder of a seat has no predecessor in the record.
	previousHolder: number | null
	sinceRecordStart: boolean
}

export interface TenureLostRow extends RowBase {
	group: "titles"
	kind: "tenure-lost"
	seat: number
}

export interface SeatMovedRow extends RowBase {
	group: "titles"
	kind: "seat-moved"
	fromSeat: number
	toSeat: number
}

export interface TitlesGainedRow extends RowBase {
	group: "titles"
	kind: "titles-gained"
	titles: number[]
	fromSeat: number
	toSeat: number
	cause: string
}

export interface TitlesLostRow extends RowBase {
	group: "titles"
	kind: "titles-lost"
	titles: number[]
	fromSeat: number
	// [JUSTIFICATION] A deposition leaves the titles with no holder.
	toSeat: number | null
	cause: string
}

export interface TitleFoundedRow extends RowBase {
	group: "titles"
	kind: "title-founded"
	title: number
	seat: number
}

export interface TitleDissolvedRow extends RowBase {
	group: "titles"
	kind: "title-dissolved"
	title: number
}

export type PersonTimelineRow =
	| BornRow
	| HealthDeclinedRow
	| DiedRow
	| MarriedRow
	| ChildBornRow
	| SiblingBornRow
	| KinDiedRow
	| TenureStartRow
	| TenureLostRow
	| SeatMovedRow
	| TitlesGainedRow
	| TitlesLostRow
	| TitleFoundedRow
	| TitleDissolvedRow

export interface PersonTimelineParams {
	state: HistoryState
	person: number
}

export interface HealthSeriesPoint {
	timeMs: number
	band: number
}

export interface LifeSpan {
	startMs: number
	endMs: number
}

export interface LifeRowsParams extends PersonTimelineParams {
	span: LifeSpan
}

export interface WithinParams {
	span: LifeSpan
	timeMs: number
}

export interface HoldsSeatParams {
	tenures: TenureView[]
	seat: number
	timeMs: number
}

export interface KinRow {
	kin: number
	relation: PersonRelation
}
