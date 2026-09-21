export type PeopleLogKind = "birth" | "death" | "wedding" | "health"

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

export interface CreatePeopleLogParams {
	capacity: number
}

export interface AppendPeopleLogParams {
	log: PeopleLogState
	time: number
	kind: PeopleLogKind
	a: number
	b: number
	c: number
	d: number
}

export interface DrainPeopleLogParams {
	log: PeopleLogState
}
