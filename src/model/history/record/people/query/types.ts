import type { PeopleRecord } from "@/model/history/record/people/types"

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
	sovereign: boolean
	startTimeMs: number
	// [JUSTIFICATION] A seat still held at the queried time has no end.
	endTimeMs: number | null
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
}

export type PersonHealth = "Good" | "Fair" | "Poor" | "Grave"

export type PersonEventKind =
	| "born"
	| "married"
	| "child born"
	| "took seat"
	| "left seat"
	| "died"

export interface PersonEvent {
	timeMs: number
	kind: PersonEventKind
	// Spouse, child or seat the event concerns; -1 for birth and death.
	other: number
}
