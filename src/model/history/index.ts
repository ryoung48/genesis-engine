import type { OrogenNationHierarchy, OrogenProvinces } from ".."
import type { ProvincePopulation } from "../society/population"
import { EVT } from "./event-heap"
import { runBattle } from "./events/battle"
import { initDiplomacy, runDiplomacy } from "./events/diplomacy"
import { initPopulation, runPopulation } from "./events/population"
import { initSuccession, runSuccession } from "./events/succession"
import { initTax, runTax } from "./events/tax"
import { initWar, runWar } from "./events/war"
import { createHistoryRng, type HistoryRng } from "./history-rng"
import {
	createHistoryState,
	type HistoryState,
	validateLiveHierarchy,
} from "./state"

export function initHistory(params: {
	nations: OrogenNationHierarchy
	provinces: OrogenProvinces
	population: ProvincePopulation
	coastal: Uint8Array
	riverVisible: Uint8Array
	r_xyz: Float32Array
	cultures: { assignment: Int32Array }
	seed: number
	startYear?: number
}): HistoryState {
	const startYear = params.startYear ?? 800
	const rng = createHistoryRng(params.seed + 99999)
	const state = createHistoryState(
		params.nations,
		params.provinces,
		params.population,
		params.coastal,
		params.riverVisible,
		params.r_xyz,
		params.cultures,
		startYear,
		rng,
	)

	initWar(state, rng)
	initSuccession(state, rng)
	initTax(state, rng)
	initDiplomacy(state, rng)
	initPopulation(state, rng)
	return state
}

function processEventsUntil(
	state: HistoryState,
	targetTime: number,
	rng: HistoryRng,
): void {
	const dataBuf = new Int32Array(4)
	while (!state.heap.isEmpty() && state.heap.peekTime() <= targetTime) {
		state.time = state.heap.peekTime()
		const type = state.heap.peekType()
		state.heap.peekData(dataBuf)
		const time2 = state.heap.peekTime2()
		state.heap.dequeue()

		switch (type) {
			case EVT.WAR:
				runWar(state, dataBuf[0], rng)
				break
			case EVT.BATTLE:
				runBattle(state, dataBuf[0], dataBuf[1], dataBuf[2], rng)
				break
			case EVT.SUCCESSION:
				runSuccession(state, dataBuf[0], dataBuf[1], rng)
				break
			case EVT.TAX:
				runTax(state, dataBuf[0], time2, rng)
				break
			case EVT.CENSUS:
				runPopulation(state, time2, rng)
				break
			case EVT.DIPLOMACY:
				runDiplomacy(state, dataBuf[0], rng)
				break
			case EVT.REGENCY: {
				const province = dataBuf[0]
				const leader = dataBuf[1]
				if (state.leaderRuntime.idx[province] === leader) {
					state.events.push({
						tag: "regency ended",
						time: state.time,
						data: { nation: province, leader },
					})
				}
				break
			}
		}
		validateLiveHierarchy(
			state,
			`after event type=${type} data=[${dataBuf[0]},${dataBuf[1]},${dataBuf[2]},${dataBuf[3]}] time=${state.time}`,
		)
	}
}

export function simulateUntil(
	state: HistoryState,
	targetTimeMs: number,
	rng: HistoryRng,
): void {
	processEventsUntil(state, targetTimeMs, rng)
	state.time = targetTimeMs
}

export { createHistoryRng } from "./history-rng"
export type { HistoryNote } from "./state"
export { YEAR_MS } from "./state"
