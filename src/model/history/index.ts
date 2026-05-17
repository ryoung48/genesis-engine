import type { OrogenNationHierarchy, OrogenProvinces } from ".."
import type { ProvincePopulation } from "../society/population"
import type { OrogenLandmarks } from "../terrain/landmarks"
import type { StageTiming } from "../types/tectonics"
import { EVT } from "./event-heap"
import { runBattle } from "./events/battle"
import { initCultureSpread, runCultureSpread } from "./events/culture-spread"
import { initDiplomacy, runDiplomacy } from "./events/diplomacy"
import { initPopulation, runPopulation } from "./events/population"
import { initSuccession, runSuccession } from "./events/succession"
import { initTax, runTax } from "./events/tax"
import { computeRoutes } from "./events/trade-routes"
import { initWar, runWar } from "./events/war"
import { createHistoryRng, type HistoryRng } from "./history-rng"
import {
	createHistoryState,
	type HistoryState,
	validateLiveHierarchy,
} from "./state"

function timed<T>(
	label: string,
	timings: StageTiming[] | undefined,
	fn: () => T,
): T {
	const t0 = performance.now()
	const result = fn()
	if (timings) {
		timings.push({ Stage: label, ms: (performance.now() - t0).toFixed(1) })
	}
	return result
}

export function initHistory(params: {
	nations: OrogenNationHierarchy
	provinces: OrogenProvinces
	population: ProvincePopulation
	coastal: Uint8Array
	waterAccess?: Uint8Array
	riverVisible: Uint8Array
	r_xyz: Float32Array
	cultures: { assignment: Int32Array; count: number }
	seed: number
	startYear?: number
	landmarks?: OrogenLandmarks
	regionProvince?: Int32Array
	regionAdjOffset?: Int32Array
	regionAdjList?: Int32Array
	regionIsLand?: Uint8Array
	planetRadiusKm?: number
	settlementRegions?: Int32Array
	settlementWaterLandmarks?: Int32Array
	settlementPortRegions?: Int32Array
	timings?: StageTiming[]
}): HistoryState {
	const startYear = params.startYear ?? 800
	const rng = createHistoryRng(params.seed + 99999)
	const state = timed("initHistory:createHistoryState", params.timings, () =>
		createHistoryState(
			params.nations,
			params.provinces,
			params.population,
			params.coastal,
			params.riverVisible,
			params.r_xyz,
			params.cultures,
			startYear,
			rng,
			params.waterAccess,
			params.landmarks,
			params.regionProvince,
			params.regionAdjOffset,
			params.regionAdjList,
			params.regionIsLand,
		),
	)

	timed("initHistory:initWar", params.timings, () => initWar(state, rng))
	timed("initHistory:initSuccession", params.timings, () =>
		initSuccession(state, rng),
	)
	timed("initHistory:initTax", params.timings, () => initTax(state, rng))
	timed("initHistory:initDiplomacy", params.timings, () =>
		initDiplomacy(state, rng),
	)
	timed("initHistory:initPopulation", params.timings, () =>
		initPopulation(state, rng),
	)
	timed("initHistory:initCultureSpread", params.timings, () =>
		initCultureSpread(state),
	)
	const infrastructure = timed(
		"initHistory:computeRoutes",
		params.timings,
		() =>
			computeRoutes(state, {
				planetRadiusKm: params.planetRadiusKm,
				settlementRegions: params.settlementRegions,
				settlementWaterLandmarks: params.settlementWaterLandmarks,
				settlementPortRegions: params.settlementPortRegions,
				timings: params.timings,
			}),
	)
	state.routes = infrastructure.routes
	state.network = infrastructure.network
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
			case EVT.CULTURE_SPREAD:
				runCultureSpread(state, state.cultureCount, rng)
				break
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
