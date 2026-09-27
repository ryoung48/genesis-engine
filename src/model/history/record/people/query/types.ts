import type { PeopleRecord } from "@/model/history/record/people/types"
import type { SeatKind } from "@/model/history/sim/engine/journal/types"

export interface PersonAtParams {
	people: PeopleRecord
	id: number
	timeMs: number
}

export interface SeatAtParams {
	people: PeopleRecord
	seat: number
	timeMs: number
}

export interface SpouseView {
	person: number
	startTimeMs: number
	// [JUSTIFICATION] A marriage still standing at the queried time has no end.
	endTimeMs: number | null
}

export interface TenureView {
	seat: number
	kind: SeatKind
	// The child a regent governs for; -1 for other kinds.
	ward: number
	startTimeMs: number
	// [JUSTIFICATION] A seat still held at the queried time has no end.
	endTimeMs: number | null
	person: number
}

export interface PersonView {
	id: number
	sex: number
	birthTimeMs: number
	// [JUSTIFICATION] The living have no death date yet.
	deathTimeMs: number | null
	father: number
	mother: number
	dynasty: number
	nameSeed: number
	home: number
	spouses: SpouseView[]
	children: number[]
	siblings: number[]
	tenures: TenureView[]
	// Regents who governed for this person as a child ruler.
	regents: TenureView[]
}

export type PersonEventKind =
	| "born"
	| "married"
	| "child born"
	| "took seat"
	| "left seat"
	| "became regent"
	| "left regency"
	| "regent appointed"
	| "died"

export interface PersonEvent {
	timeMs: number
	kind: PersonEventKind
	// Spouse, child, seat or regent the event concerns; -1 for birth and
	// death.
	other: number
	// The tenure a seat or regency event belongs to; -1 for other kinds.
	tenure: number
}
