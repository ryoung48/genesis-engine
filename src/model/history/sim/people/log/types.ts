import type { BetrothalEndCause } from "@/model/history/sim/people/betrothal/types"
import type { HealthCondition } from "@/model/history/sim/people/health/ageing/types"
import type { HealthBand } from "@/model/history/sim/people/health/types"
import type { OpinionMemoryReason } from "@/model/history/sim/people/opinion/memory/types"
import type {
	DeathCause,
	PeopleState,
	PregnancyLoss,
	SeatChangeReason,
} from "@/model/history/sim/people/types"

export type SeatKind = "ruler" | "district" | "regent"

export type PeopleRowKind =
	| "creation"
	| "death"
	| "wedding"
	| "consort"
	| "health_band"
	| "condition"
	| "seat"
	| "pregnancy"
	| "betrothal"
	| "betrothal_end"
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
export interface InitialTenure {
	person: number
	seat: number
	kind: "ruler" | "district"
	start: number | null
	end: number
	startReason: SeatChangeReason
	endReason: SeatChangeReason | null
}

export interface PeopleLog extends PeopleRows {
	initialTenures: InitialTenure[]
	// People already sealed into a packet; ids from here on are new.
	emitted: number
}

// One journal transaction's rows in append order, sized exactly, with the
// snapshot of each person its creation rows introduce. A snapshot's death is
// set only for a person already dead when created; the living carry Infinity.
export interface PeoplePacket extends PeopleRows {
	initialTenures: InitialTenure[]
	sex: Uint8Array
	orientation: Uint8Array
	createdAt: Float64Array
	death: Float64Array
	// The health band when the person was created.
	healthBand: Uint8Array
	dynasty: Int32Array
	culture: Int32Array
	nameSeed: Int32Array
	home: Int32Array
	initialResidence: Int32Array
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

// A death as it happens.
export interface DeathRow {
	kind: "death"
	time: number
	person: number
	cause: DeathCause
}

export interface ConsortRow {
	kind: "consort"
	time: number
	patron: number
	partner: number
	consortKind: "wife" | "concubine"
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

// A person's health entering another band.
export interface HealthBandRow {
	kind: "health_band"
	time: number
	person: number
	band: HealthBand
}

// A condition gained, changing level or lost; an absent level is -1.
export interface ConditionRow {
	kind: "condition"
	time: number
	person: number
	condition: HealthCondition
	before: number
	after: number
}

export interface ResidenceRow {
	kind: "residence"
	time: number
	person: number
	province: number
}

// An interaction the observer remembers of the target from this time; its
// strength follows from the reason.
export interface OpinionMemoryRow {
	kind: "opinion_memory"
	time: number
	observer: number
	target: number
	reason: OpinionMemoryReason
}

export type AppendedRow =
	| OpinionMemoryRow
	| ConditionRow
	| HealthBandRow
	| ResidenceRow
	| DeathRow
	| WeddingRow
	| ConsortRow
	| SeatChange
	| RegentRow
	| PregnancyRow
	| BetrothalRow
	| BetrothalEndRow

export type PeopleRow =
	| OpinionMemoryRow
	| ConditionRow
	| HealthBandRow
	| ResidenceRow
	| CreationRow
	| DeathRow
	| WeddingRow
	| ConsortRow
	| SeatRow
	| RegentRow
	| PregnancyRow
	| BetrothalRow
	| BetrothalEndRow

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
