import type { BetrothalEndCause } from "@/model/history/sim/people/betrothal/types"
import type {
	PeopleState,
	PregnancyLoss,
	SeatChangeReason,
} from "@/model/history/sim/people/types"

export type SeatKind = "ruler" | "district" | "regent"

export type PeopleRowKind =
	| "creation"
	| "death"
	| "wedding"
	| "health_band"
	| "condition"
	| "seat"
	| "pregnancy"
	| "betrothal"
	| "betrothal_end"
	| "stress"
	| "residence"
	| "opinion_memory"
	| "regent"

// One row per index: its effective time in simulation years, its kind code and
// four payload slots whose meaning the kind decides.
export interface PeopleRows {
	count: number
	time: Float64Array
	kind: Uint8Array
	a: Int32Array
	b: Int32Array
	c: Int32Array
	d: Int32Array
}

// Rows the journal has not yet taken. The columns grow by doubling and are
// never transferred.
export interface PeopleLog extends PeopleRows {
	// People already sealed into a packet; ids from here on are new.
	emitted: number
}

// One journal transaction's rows in append order, sized exactly, with the
// snapshot of each person its creation rows introduce.
export interface PeoplePacket extends PeopleRows {
	sex: Uint8Array
	death: Float64Array
	dynasty: Int32Array
	culture: Int32Array
	nameSeed: Int32Array
	home: Int32Array
	bases: Float64Array
	personality: Float64Array
	grades: Float64Array
	congenital: Float64Array
	carried: Float64Array
}

export interface CreationRow {
	kind: "creation"
	// Birth.
	time: number
	person: number
	father: number
	mother: number
	// Index into the packet's snapshot columns.
	snapshot: number
}

// A death date moved earlier.
export interface DeathRow {
	kind: "death"
	time: number
	person: number
}

export interface WeddingRow {
	kind: "wedding"
	time: number
	husband: number
	wife: number
}

// A seat (sovereign root or district) changing holder; -1 leaves it empty.
// Its time is the transaction's.
export interface SeatChange {
	kind: "seat"
	seat: number
	person: number
	reason: SeatChangeReason
}

export interface SeatRow extends SeatChange {
	// A throne is a sovereign root when the row is sealed.
	seatKind: Exclude<SeatKind, "regent">
}

// A seat's regent changing; -1 for a council or the end of the regency.
export interface RegentRow {
	kind: "regent"
	seat: number
	person: number
	ward: number
	reason: SeatChangeReason
}

// A pregnancy that bore no living child or killed the mother.
export interface PregnancyRow {
	kind: "pregnancy"
	// When the pregnancy ended.
	time: number
	mother: number
	father: number
	outcome: PregnancyLoss
}

export interface BetrothalRow {
	kind: "betrothal"
	time: number
	a: number
	b: number
}

// A betrothal released by death or a broken alliance; a fulfilled one ends in
// its wedding row instead.
export interface BetrothalEndRow {
	kind: "betrothal_end"
	time: number
	a: number
	b: number
	cause: BetrothalEndCause
}

export interface StressRow {
	kind: "stress"
	time: number
	person: number
	level: number
}

export type AppendedRow =
	| DeathRow
	| WeddingRow
	| SeatChange
	| RegentRow
	| PregnancyRow
	| BetrothalRow
	| BetrothalEndRow
	| StressRow

export type PeopleRow =
	| CreationRow
	| DeathRow
	| WeddingRow
	| SeatRow
	| RegentRow
	| PregnancyRow
	| BetrothalRow
	| BetrothalEndRow
	| StressRow

export interface AppendRowParams {
	log: PeopleLog
	row: AppendedRow
}

export interface SealParams {
	people: PeopleState
	sovereign: (seat: number) => boolean
}

export interface ReadRowParams {
	rows: PeopleRows
	index: number
}

export interface CodeParams<T extends string> {
	codes: Record<T, number>
	name: T
}

export interface NameParams<T extends string> {
	names: readonly T[]
	code: number
}
