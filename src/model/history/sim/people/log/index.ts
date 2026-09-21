import type {
	AppendPeopleLogParams,
	CreatePeopleLogParams,
	DrainPeopleLogParams,
	PeopleLogChunk,
	PeopleLogKind,
	PeopleLogState,
} from "@/model/history/sim/people/log/types"

const KIND: Record<PeopleLogKind, number> = {
	birth: 0,
	death: 1,
	wedding: 2,
	health: 3,
}

function chunk(capacity: number): PeopleLogChunk {
	return {
		count: 0,
		time: new Float64Array(capacity),
		kind: new Uint8Array(capacity),
		a: new Int32Array(capacity),
		b: new Int32Array(capacity),
		c: new Int32Array(capacity),
		d: new Int32Array(capacity),
	}
}

function create({ capacity }: CreatePeopleLogParams): PeopleLogState {
	const size = Math.max(1, Math.min(64000, Math.ceil(capacity)))
	return {
		capacity: size,
		lastTime: Number.NEGATIVE_INFINITY,
		active: chunk(size),
		completed: [],
	}
}

function append({ log, time, kind, a, b, c, d }: AppendPeopleLogParams): void {
	if (time < log.lastTime) throw new Error("People log must be chronological")
	if (log.active.count === log.capacity) {
		log.completed.push(log.active)
		log.active = chunk(log.capacity)
	}
	const i = log.active.count++
	log.active.time[i] = time
	log.active.kind[i] = KIND[kind]
	log.active.a[i] = a
	log.active.b[i] = b
	log.active.c[i] = c
	log.active.d[i] = d
	log.lastTime = time
}

function drain({ log }: DrainPeopleLogParams): PeopleLogChunk[] {
	const result = log.completed
	log.completed = []
	if (log.active.count > 0) {
		const count = log.active.count
		result.push({
			count,
			time: log.active.time.slice(0, count),
			kind: log.active.kind.slice(0, count),
			a: log.active.a.slice(0, count),
			b: log.active.b.slice(0, count),
			c: log.active.c.slice(0, count),
			d: log.active.d.slice(0, count),
		})
		log.active.count = 0
	}
	return result
}

export const PEOPLE_LOG = { create, append, drain }
