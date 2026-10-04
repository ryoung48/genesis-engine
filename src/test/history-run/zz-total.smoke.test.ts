import { it } from "vitest"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { HISTORY_RUN } from "@/test/history-run"

it("total", () => {
	const seed = 14963991
	const { engine: state } = HISTORY_RUN.createEngine({ seed, era: "lateMedieval", numPoints: 204000 })
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const start = state.time
	const t0 = performance.now()
	let events = 0
	const dequeue = state.heap.dequeue.bind(state.heap)
	state.heap.dequeue = () => {
		events++
		dequeue()
	}
	for (let year = 1; year <= 60; year++) {
		SIM_ENGINE.simulateUntil({ state, targetTimeMs: start + STATE.deltaYear(year), rng, validate: false })
		state.journal.length = 0
	}
	throw new Error(`TOTAL ${(performance.now() - t0).toFixed(0)} ms, events ${events}, heap ${state.heap.size}, people ${state.people.persons.sex.length}`)
}, 900000)
