/**
 * TAX EVENT — recovers wealth during peacetime.
 * Port of src/model/history/events/tax.ts
 */

import { provinceWars } from "../derive"
import { EVT } from "../event-heap"
import { PROV } from "../fields"
import type { HistoryRng } from "../history-rng"
import { type HistoryState, wealthOptimal, YEAR_MS } from "../state"

/** Calculate fraction of past year spent at peace (0 = all war, 1 = all peace) */
function peaceFraction(
	state: HistoryState,
	nation: number,
	previous: number,
): number {
	const start = previous
	const end = state.time
	const duration = end - start
	if (duration <= 0) return 1

	const wars = provinceWars(state, nation, end)
		.map((idx: number) => state.wars[idx])
		.filter((w) => w.startTime <= end)

	let warTime = 0
	for (const war of wars) {
		const warStart = Math.max(war.startTime, start)
		const warEnd = Math.min(war.endTime ?? end, end)
		if (warStart < warEnd) warTime += warEnd - warStart
	}

	return Math.max(0, duration - warTime) / duration
}

export function initTax(state: HistoryState, _rng: HistoryRng): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		state.heap.enqueue(state.time + YEAR_MS, EVT.TAX, p, 0, 0, 0, state.time)
	}
}

export function runTax(
	state: HistoryState,
	nation: number,
	previousTime: number,
	_rng: HistoryRng,
): void {
	const peace = peaceFraction(state, nation, previousTime)
	const recovered = wealthOptimal(state, nation) * 0.1 * peace
	PROV.consumption.set(
		state,
		nation,
		state.time,
		Math.max(0, PROV.consumption.get(state, nation) - recovered),
	)

	// Schedule next tax event
	state.heap.enqueue(state.time + YEAR_MS, EVT.TAX, nation, 0, 0, 0, state.time)
}
