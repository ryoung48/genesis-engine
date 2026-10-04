import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	ConsumeParams,
	DeathSchedule,
	EnsureParams,
	ScheduleParams,
	ScheduleStateParams,
} from "@/model/history/sim/engine/events/people/death/schedule/types"
import { STATE } from "@/model/history/sim/engine/state"
import type { DeathCause } from "@/model/history/sim/people/types"

// A death dated to the present is stored in years, and converting it back to
// engine time can land a rounding error before now; only a death clearly in
// the past was complete when its person was created.
const PAST_TOLERANCE_MS = 1

function create(): DeathSchedule {
	return {
		pending: new Map(),
		revision: 0,
		done: new Uint8Array(1024),
		offered: 0,
		processing: -1,
	}
}

function applied({ state, person }: ScheduleParams): boolean {
	return state.deathSchedule.done[person] === 1
}

// A finite death date gets one live token; a date that moves replaces it, and
// an unknown date leaves none. A death before now with no token was already
// complete when the person was created. Someone handed a seat after their
// death was applied gets a token for that seat alone.
function ensure({ state, person, cause }: EnsureParams): void {
	if (person < 0) return
	const repeat = applied({ state, person })
	if (repeat && state.people.persons.heldSeats[person].length === 0) return
	const schedule = state.deathSchedule
	const pending = schedule.pending.get(person)
	if (pending?.status === "processing") return
	const death = state.people.persons.death[person] * STATE.yearMs
	if (!Number.isFinite(death)) {
		schedule.pending.delete(person)
		return
	}
	if (!pending && !repeat && death < state.time - PAST_TOLERANCE_MS) return
	const due = Math.max(state.time, death)
	if (pending?.due === due) {
		if (cause !== "natural") pending.cause = cause
		return
	}
	const revision = ++schedule.revision
	schedule.pending.set(person, { revision, due, cause, status: "pending" })
	state.heap.enqueue(due, EVENT_HEAP.evt.DEATH, person, revision)
}

function offerNew({ state }: ScheduleStateParams): void {
	const schedule = state.deathSchedule
	const count = state.people.persons.sex.length
	for (let person = schedule.offered; person < count; person++)
		ensure({ state, person, cause: "natural" })
	schedule.offered = count
}

function revisionOf({ state, person }: ScheduleParams): number {
	return state.deathSchedule.pending.get(person)?.revision ?? -1
}

function consume({
	state,
	person,
	revision,
}: ConsumeParams): DeathCause | null {
	const schedule = state.deathSchedule
	const pending = schedule.pending.get(person)
	if (
		!pending ||
		pending.status !== "pending" ||
		pending.revision !== revision ||
		pending.due !== state.time ||
		state.people.persons.death[person] * STATE.yearMs > state.time
	)
		return null
	pending.status = "processing"
	schedule.processing = person
	return pending.cause
}

function finish({ state, person }: ScheduleParams): void {
	const schedule = state.deathSchedule
	schedule.pending.delete(person)
	schedule.processing = -1
	if (person >= schedule.done.length) {
		const grown = new Uint8Array(Math.max(person + 1, schedule.done.length * 2))
		grown.set(schedule.done)
		schedule.done = grown
	}
	schedule.done[person] = 1
}

export const DEATH_SCHEDULE = {
	create,
	applied,
	ensure,
	offerNew,
	revisionOf,
	consume,
	finish,
}
