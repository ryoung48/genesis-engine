import type { PersonTable } from "@/model/history/sim/people/types"

export type PeopleLogKind =
	| "birth"
	| "death"
	| "wedding"
	| "health"
	| "arrival"
	| "seat"

export type DeathCause = "natural" | "childhood" | "childbirth"

export interface PeopleLogChunk {
	count: number
	time: Float64Array
	kind: Uint8Array
	a: Int32Array
	b: Int32Array
	c: Int32Array
	d: Int32Array
}

export interface PeopleLogState {
	capacity: number
	lastTime: number
	active: PeopleLogChunk
	completed: PeopleLogChunk[]
}

export interface PeopleLogRow {
	time: number
	kind: PeopleLogKind
	a: number
	b: number
	c: number
	d: number
}

export interface CreatePeopleLogParams {
	capacity: number
}

export interface AppendPeopleLogParams extends PeopleLogRow {
	log: PeopleLogState
}

export interface DrainPeopleLogParams {
	log: PeopleLogState
}

export interface PersonRowParams {
	persons: PersonTable
	person: number
	time: number
}

export interface ArrivalRowParams extends PersonRowParams {
	ageDays: number
}

export interface WeddingRowParams {
	time: number
	husband: number
	wife: number
}

export interface SeatRowParams {
	time: number
	person: number
	seat: number
	gained: boolean
}

export interface PersonIdentity {
	dynasty: number
	culture: number
	sex: 0 | 1
}

export interface PersonIdentityParams {
	persons: PersonTable
	person: number
}
