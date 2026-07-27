import type { GenesisNationHierarchy, GenesisProvinces } from "@/model"
import { EVT } from "@/model/history/event-heap"
import { runBattle } from "@/model/history/events/battle"
import {
	initCultureSpread,
	runCultureSpread,
} from "@/model/history/events/culture-spread"
import { initDiplomacy, runDiplomacy } from "@/model/history/events/diplomacy"
import {
	initPopulation,
	runPopulation,
} from "@/model/history/events/population"
import {
	initSuccession,
	runSuccession,
} from "@/model/history/events/succession"
import { initTax, runTax } from "@/model/history/events/tax"
import { initWar, runWar } from "@/model/history/events/war"
import { REL as REL_FIELD } from "@/model/history/fields"
import { createHistoryRng, type HistoryRng } from "@/model/history/history-rng"
import {
	createHistoryState,
	type HistoryState,
	REL,
	validateLiveHierarchy,
} from "@/model/history/state"
import type { ProvincePopulation, SocietyEra } from "@/model/society/types"
import type { GenesisLandmarks } from "@/model/terrain"
import type { StageTiming } from "@/model/types"

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

function seedColonyRelations(
	state: HistoryState,
	nations: GenesisNationHierarchy | undefined,
): void {
	if (!nations?.nationColonizer) return
	const { seeds, nationColonizer } = nations
	for (let col = 0; col < nationColonizer.length; col++) {
		const colonizerId = nationColonizer[col]
		if (colonizerId < 0) continue
		const colonyCapital = seeds[col]
		const colonizerCapital = seeds[colonizerId]
		if (colonyCapital < 0 || colonizerCapital < 0) continue
		REL_FIELD.set(
			state,
			colonyCapital,
			colonizerCapital,
			REL.COLONY,
			state.time,
		)
	}
}

export function initHistory(params: {
	nations: GenesisNationHierarchy
	provinces: GenesisProvinces
	population: ProvincePopulation
	coastal: Uint8Array
	waterAccess?: Uint8Array
	riverVisible: Uint8Array
	r_xyz: Float32Array
	cultures: { assignment: Int32Array; count: number }
	era?: SocietyEra
	seed: number
	startYear?: number
	landmarks?: GenesisLandmarks
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
			params.era,
		),
	)

	// Seed colony dependencies before init passes so subordinate colonies are
	// excluded from independent diplomacy and subject formation.
	seedColonyRelations(state, params.nations)

	timed("initHistory:initDiplomacy", params.timings, () =>
		initDiplomacy(state, rng),
	)
	timed("initHistory:initWar", params.timings, () => initWar(state, rng))
	timed("initHistory:initSuccession", params.timings, () =>
		initSuccession(state, rng),
	)
	timed("initHistory:initTax", params.timings, () => initTax(state, rng))
	timed("initHistory:initPopulation", params.timings, () =>
		initPopulation(state, rng),
	)
	timed("initHistory:initCultureSpread", params.timings, () =>
		initCultureSpread(state),
	)

	// Re-seed COLONY relations so init passes cannot leave them downgraded.
	seedColonyRelations(state, params.nations)

	return state
}

function processEventsUntil(
	state: HistoryState,
	targetTime: number,
	rng: HistoryRng,
	validate: boolean,
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
				runBattle({
					state,
					warIdx: dataBuf[0],
					eventAttacker: dataBuf[1],
					eventDefender: dataBuf[2],
					rng,
				})
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
		if (validate) {
			validateLiveHierarchy(
				state,
				`after event type=${type} data=[${dataBuf[0]},${dataBuf[1]},${dataBuf[2]},${dataBuf[3]}] time=${state.time}`,
			)
		}
	}
}

/** `validate` re-checks the province-parent hierarchy for cycles/corruption
 * after every single event -- invaluable for tracking down exactly which
 * event broke it, but O(P) per event, which dominates runtime at real-world
 * province counts (measured: ~600ms/year become the majority of wall time).
 * Leave off for real generation runs; the caller can still validate once at
 * the end (see validateLiveHierarchy) to catch corruption without paying
 * this cost after every event. */
export function simulateUntil(
	state: HistoryState,
	targetTimeMs: number,
	rng: HistoryRng,
	validate = false,
): void {
	processEventsUntil(state, targetTimeMs, rng, validate)
	state.time = targetTimeMs
}

export { historyMsToEu4Days } from "./eu4-days"
export { createHistoryRng } from "./history-rng"
export type { HistoryNote } from "./state"
export { YEAR_MS } from "./state"
