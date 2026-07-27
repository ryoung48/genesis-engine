import type { GenesisNationHierarchy, GenesisProvinces } from "@/model"
import { EVENT_HEAP } from "@/model/history/event-heap"
import { BATTLE } from "@/model/history/events/battle"
import { CULTURE_SPREAD } from "@/model/history/events/culture-spread"
import { DIPLOMACY } from "@/model/history/events/diplomacy"
import { POPULATION } from "@/model/history/events/population"
import { SUCCESSION } from "@/model/history/events/succession"
import { TAX } from "@/model/history/events/tax"
import { WAR } from "@/model/history/events/war"
import { FIELDS } from "@/model/history/fields"
import { HISTORY_RNG } from "@/model/history/history-rng"
import type { HistoryRng } from "@/model/history/history-rng/types"
import { STATE } from "@/model/history/state"
import type { HistoryState } from "@/model/history/state/types"
import type {
	ProcessEventsUntilParams,
	SeedColonyRelationsParams,
} from "@/model/history/types"
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

function seedColonyRelations({
	state,
	nations,
}: SeedColonyRelationsParams): void {
	if (!nations?.nationColonizer) return
	const { seeds, nationColonizer } = nations
	for (let col = 0; col < nationColonizer.length; col++) {
		const colonizerId = nationColonizer[col]
		if (colonizerId < 0) continue
		const colonyCapital = seeds[col]
		const colonizerCapital = seeds[colonizerId]
		if (colonyCapital < 0 || colonizerCapital < 0) continue
		FIELDS.rel.set(
			state,
			colonyCapital,
			colonizerCapital,
			STATE.rel.COLONY,
			state.time,
		)
	}
}

function initHistory(params: {
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
	const rng = HISTORY_RNG.createHistoryRng(params.seed + 99999)
	const state = timed("initHistory:createHistoryState", params.timings, () =>
		STATE.createHistoryState({
			nations: params.nations,
			provinces: params.provinces,
			population: params.population,
			coastal: params.coastal,
			riverVisible: params.riverVisible,
			r_xyz: params.r_xyz,
			cultures: params.cultures,
			startYear,
			rng,
			waterAccess: params.waterAccess,
			landmarks: params.landmarks,
			regionProvince: params.regionProvince,
			regionAdjOffset: params.regionAdjOffset,
			regionAdjList: params.regionAdjList,
			regionIsLand: params.regionIsLand,
			era: params.era,
		}),
	)

	// Seed colony dependencies before init passes so subordinate colonies are
	// excluded from independent diplomacy and subject formation.
	seedColonyRelations({ state, nations: params.nations })

	timed("initHistory:initDiplomacy", params.timings, () =>
		DIPLOMACY.initDiplomacy({ state, rng }),
	)
	timed("initHistory:initWar", params.timings, () =>
		WAR.initWar({ state, rng }),
	)
	timed("initHistory:initSuccession", params.timings, () =>
		SUCCESSION.initSuccession({ state }),
	)
	timed("initHistory:initTax", params.timings, () => TAX.initTax({ state }))
	timed("initHistory:initPopulation", params.timings, () =>
		POPULATION.initPopulation({ state }),
	)
	timed("initHistory:initCultureSpread", params.timings, () =>
		CULTURE_SPREAD.initCultureSpread(state),
	)

	// Re-seed COLONY relations so init passes cannot leave them downgraded.
	seedColonyRelations({ state, nations: params.nations })

	return state
}

function processEventsUntil({
	state,
	targetTime,
	rng,
	validate,
}: ProcessEventsUntilParams): void {
	const dataBuf = new Int32Array(4)
	while (!state.heap.isEmpty() && state.heap.peekTime() <= targetTime) {
		state.time = state.heap.peekTime()
		const type = state.heap.peekType()
		state.heap.peekData(dataBuf)
		const time2 = state.heap.peekTime2()
		state.heap.dequeue()

		switch (type) {
			case EVENT_HEAP.evt.WAR:
				WAR.runWar({ state, nation: dataBuf[0], rng })
				break
			case EVENT_HEAP.evt.BATTLE:
				BATTLE.runBattle({
					state,
					warIdx: dataBuf[0],
					eventAttacker: dataBuf[1],
					eventDefender: dataBuf[2],
					rng,
				})
				break
			case EVENT_HEAP.evt.SUCCESSION:
				SUCCESSION.runSuccession({
					state,
					province: dataBuf[0],
					leaderIdx: dataBuf[1],
					rng,
				})
				break
			case EVENT_HEAP.evt.TAX:
				TAX.runTax({
					state,
					nation: dataBuf[0],
					previousTime: time2,
				})
				break
			case EVENT_HEAP.evt.CENSUS:
				POPULATION.runPopulation({ state, previousTime: time2 })
				break
			case EVENT_HEAP.evt.DIPLOMACY:
				DIPLOMACY.runDiplomacy({ state, nation: dataBuf[0], rng })
				break
			case EVENT_HEAP.evt.REGENCY: {
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
			case EVENT_HEAP.evt.CULTURE_SPREAD:
				CULTURE_SPREAD.runCultureSpread({
					state,
					cultureCount: state.cultureCount,
					rng,
				})
				break
		}
		if (validate) {
			STATE.validateLiveHierarchy({
				state,
				context: `after event type=${type} data=[${dataBuf[0]},${dataBuf[1]},${dataBuf[2]},${dataBuf[3]}] time=${state.time}`,
			})
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
function simulateUntil(
	state: HistoryState,
	targetTimeMs: number,
	rng: HistoryRng,
	validate = false,
): void {
	processEventsUntil({ state, targetTime: targetTimeMs, rng, validate })
	state.time = targetTimeMs
}

export const HISTORY = {
	initHistory,
	simulateUntil,
}
