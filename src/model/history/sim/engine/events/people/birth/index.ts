import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	QueueBirthsParams,
	RunBirthParams,
} from "@/model/history/sim/engine/events/people/birth/types"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { STATE } from "@/model/history/sim/engine/state"
import { FERTILITY } from "@/model/history/sim/people/fertility"

// Every new pending delivery gets its event at the time it ends.
function queue({ state }: QueueBirthsParams): void {
	const people = state.people
	for (const delivery of FERTILITY.takeQueued({ people }))
		state.heap.enqueue(
			Math.max(state.time, delivery.due * STATE.yearMs),
			EVENT_HEAP.evt.BIRTH,
			delivery.id,
		)
	state.lifecycle.peakDeliveries = Math.max(
		state.lifecycle.peakDeliveries,
		people.deliveries.byId.size,
	)
}

// The pregnancy ends as it was decided at conception: the children exist
// before a fatal delivery takes the mother.
function run({ state, id, rng }: RunBirthParams): void {
	const people = state.people
	const time = state.time / STATE.yearMs
	const pregnancy = FERTILITY.finishDelivery({ people, id, time })
	if (!pregnancy) return
	state.lifecycle.births++
	if (FERTILITY.deliver({ people, pregnancy, time, rng }))
		PERSON_DEATH.kill({
			state,
			person: pregnancy.mother,
			cause: "childbirth",
			rng,
		})
}

export const BIRTH_EVENTS = { queue, run }
