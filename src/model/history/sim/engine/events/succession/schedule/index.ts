import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	ConsumeParams,
	ScheduleParams,
	SuccessionSchedule,
} from "@/model/history/sim/engine/events/succession/schedule/types"
import { STATE } from "@/model/history/sim/engine/state"

function create(): SuccessionSchedule {
	return {
		pending: new Map(),
		revisions: new Map(),
		accountedEdges: new Set(),
		processing: -1,
	}
}

function invalidate({ state, person }: ScheduleParams): void {
	if (state.successionSchedule.pending.get(person)?.status === "processing")
		return
	state.successionSchedule.pending.delete(person)
}

function ensure({ state, person }: ScheduleParams): void {
	if (person < 0) return
	const schedule = state.successionSchedule
	if (state.people.persons.heldSeats[person].length === 0) {
		invalidate({ state, person })
		return
	}
	const due = Math.max(
		state.time,
		state.people.persons.death[person] * STATE.yearMs,
	)
	const pending = schedule.pending.get(person)
	if (pending?.status === "processing" || pending?.due === due) return
	const revision = (schedule.revisions.get(person) ?? 0) + 1
	schedule.revisions.set(person, revision)
	schedule.pending.set(person, { revision, due, status: "pending" })
	state.heap.enqueue(due, EVENT_HEAP.evt.SUCCESSION, person, revision)
}

function consume({ state, person, revision }: ConsumeParams): boolean {
	const schedule = state.successionSchedule
	const pending = schedule.pending.get(person)
	if (
		!pending ||
		pending.status !== "pending" ||
		pending.revision !== revision ||
		pending.due !== state.time ||
		state.people.persons.death[person] * STATE.yearMs > state.time ||
		state.people.persons.heldSeats[person].length === 0
	)
		return false
	pending.status = "processing"
	schedule.processing = person
	schedule.accountedEdges.clear()
	return true
}

function finish({ state, person }: ScheduleParams): void {
	state.successionSchedule.pending.delete(person)
	state.successionSchedule.processing = -1
	state.successionSchedule.accountedEdges.clear()
}

export const SUCCESSION_SCHEDULE = {
	create,
	ensure,
	consume,
	finish,
}
