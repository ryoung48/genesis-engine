import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { PendingSuccession } from "@/test/history-run/fixtures/heap/types"

type EventType = (typeof EVENT_HEAP.evt)[keyof typeof EVENT_HEAP.evt]

// Every queued event of the type that names a realm and its accession index,
// whether or not it would still run. The queue is drained and refilled.
function queued({
	state,
	wanted,
}: {
	state: HistoryState
	wanted: EventType
}): PendingSuccession[] {
	const data = new Int32Array(4)
	const all: {
		time: number
		type: number
		data: number[]
		time2: number
	}[] = []
	while (!state.heap.isEmpty()) {
		state.heap.peekData(data)
		all.push({
			time: state.heap.peekTime(),
			type: state.heap.peekType(),
			data: [...data],
			time2: state.heap.peekTime2(),
		})
		state.heap.dequeue()
	}
	const found: PendingSuccession[] = []
	for (const event of all) {
		state.heap.enqueue(
			event.time,
			event.type as EventType,
			event.data[0],
			event.data[1],
			event.data[2],
			event.data[3],
			event.time2,
		)
		if (event.type === wanted)
			found.push({ realm: event.data[0], idx: event.data[1], time: event.time })
	}
	return found
}

function successions(state: HistoryState): PendingSuccession[] {
	return queued({ state, wanted: EVENT_HEAP.evt.SUCCESSION })
}

function comingsOfAge(state: HistoryState): PendingSuccession[] {
	return queued({ state, wanted: EVENT_HEAP.evt.REGENCY })
}

// The realms whose queued succession would run: current, sovereign and not a
// union junior.
function current(state: HistoryState): number[] {
	return successions(state)
		.filter(
			({ realm, idx }) =>
				state.leaderRuntime.idx[realm] === idx &&
				STATE.isSovereign({ state, p: realm }) &&
				!STATE.isUnionJunior({ state, p: realm }),
		)
		.map(({ realm }) => realm)
}

export const HEAP_FIXTURE = { successions, comingsOfAge, current }
