import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { BATTLE } from "@/model/history/sim/engine/events/battle"
import { DIPLOMACY } from "@/model/history/sim/engine/events/diplomacy"
import { PEOPLE_EVENTS } from "@/model/history/sim/engine/events/people"
import { ROYAL_MARRIAGES } from "@/model/history/sim/engine/events/people/royal-marriages"
import { POPULATION } from "@/model/history/sim/engine/events/population"
import { RAID } from "@/model/history/sim/engine/events/raid"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { WAR } from "@/model/history/sim/engine/events/war"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { MILITARY } from "@/model/history/sim/engine/military"
import type {
	ProcessEventsUntilParams,
	SeedColonyRelationsParams,
	SimulateUntilParams,
	TimedParams,
} from "@/model/history/sim/engine/simulation/types"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { StageTiming } from "@/model/pipelines/types"
import { UNITS } from "@/model/shared/units"
import { ERAS } from "@/model/society/eras"
import type { ProvincePopulation } from "@/model/society/population/types"
import type {
	GenesisNationHierarchy,
	GenesisPartition,
	GenesisProvinces,
	SocietyEra,
} from "@/model/society/types"

function timed<T>({ label, timings, fn }: TimedParams<T>): T {
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
		FIELDS.rel.set({
			state,
			a: colonyCapital,
			b: colonizerCapital,
			rel: STATE.rel.COLONY,
		})
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
	cultures: GenesisPartition
	// [JUSTIFICATION] Some generated eras do not create religious partitions.
	religions?: GenesisPartition
	era?: SocietyEra
	seed: number
	startYear?: number
	landmarks?: GenesisLandmarks
	regionProvince?: Int32Array
	regionAdjOffset?: Int32Array
	regionAdjList?: Int32Array
	regionIsLand?: Uint8Array
	// [JUSTIFICATION] Worlds without a custom planet size use Earth's radius.
	planetRadiusKm?: number
	topography: Uint8Array | null
	vegetation: Uint8Array | null
	settlementRegions?: Int32Array
	settlementWaterLandmarks?: Int32Array
	settlementPortRegions?: Int32Array
	timings?: StageTiming[]
}): HistoryState {
	const startYear = params.startYear ?? STATE.defaultStartYear
	const rng = HISTORY_RNG.createHistoryRng(params.seed + 99999)
	const state = timed({
		label: "initHistory:createHistoryState",
		timings: params.timings,
		fn: () =>
			STATE.createHistoryState({
				nations: params.nations,
				provinces: params.provinces,
				population: params.population,
				coastal: params.coastal,
				riverVisible: params.riverVisible,
				r_xyz: params.r_xyz,
				cultures: params.cultures,
				religions: params.religions,
				startYear,
				rng,
				waterAccess: params.waterAccess,
				landmarks: params.landmarks,
				regionProvince: params.regionProvince,
				regionAdjOffset: params.regionAdjOffset,
				regionAdjList: params.regionAdjList,
				regionIsLand: params.regionIsLand,
				era: params.era,
				planetRadiusKm: params.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm,
				topography: params.topography,
				vegetation: params.vegetation,
			}),
	})

	// The year curve is calibrated on late-medieval worlds; worlds generated for
	// other eras keep their era's level unless given an explicit start year.
	state.knowledgeBaseline =
		params.startYear === undefined && state.era !== ERAS.defaultEra
			? KNOWLEDGE.eraBaseline(state.era)
			: KNOWLEDGE.yearBaseline(startYear)

	// Seed colony dependencies before init passes so subordinate colonies are
	// excluded from independent diplomacy and subject formation.
	seedColonyRelations({ state, nations: params.nations })

	// Population runs first: diplomacy and war seeding compare revenue and
	// armies, which read development, knowledge and the seeded economy.
	timed({
		label: "initHistory:initPopulation",
		timings: params.timings,
		fn: () => POPULATION.initPopulation({ state }),
	})
	timed({
		label: "initHistory:initEconomy",
		timings: params.timings,
		fn: () => ECONOMY.initEconomy({ state }),
	})
	timed({
		label: "initHistory:initMilitary",
		timings: params.timings,
		fn: () => MILITARY.initialize({ state }),
	})
	timed({
		label: "initHistory:initDiplomacy",
		timings: params.timings,
		fn: () => DIPLOMACY.initDiplomacy({ state, rng }),
	})
	// Districts are granted before war seeding: only districts can rebel.
	timed({
		label: "initHistory:initPeople",
		timings: params.timings,
		fn: () => PEOPLE_EVENTS.init({ state, rng }),
	})
	timed({
		label: "initHistory:initWar",
		timings: params.timings,
		fn: () => WAR.initWar({ state, rng }),
	})
	timed({
		label: "initHistory:initSuccession",
		timings: params.timings,
		fn: () => SUCCESSION.initSuccession({ state }),
	})
	timed({
		label: "initHistory:initTax",
		timings: params.timings,
		fn: () => TAX.initTax({ state }),
	})
	timed({
		label: "initHistory:initRaid",
		timings: params.timings,
		fn: () => RAID.initRaid({ state, rng }),
	})
	// Re-seed COLONY relations so init passes cannot leave them downgraded.
	seedColonyRelations({ state, nations: params.nations })

	ROYAL_MARRIAGES.review({ state })
	MILITARY.reconcile({ state })
	MILITARY.recordArmies({ state })
	JOURNAL.flush({ state, noteCursor: 0, census: true, initial: true })
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
		const noteCursor = state.events.length
		state.time = state.heap.peekTime()
		const type = state.heap.peekType()
		state.heap.peekData(dataBuf)
		const time2 = state.heap.peekTime2()
		state.heap.dequeue()

		if (type === EVENT_HEAP.evt.BATTLE || type === EVENT_HEAP.evt.SIEGE)
			MILITARY.touch({ state, nation: state.wars[dataBuf[0]].attacker })
		else if (
			type === EVENT_HEAP.evt.CENSUS ||
			type === EVENT_HEAP.evt.PEOPLE_YEAR
		)
			MILITARY.touchAll({ state })
		else MILITARY.touch({ state, nation: dataBuf[0] })
		MILITARY.reconcile({ state })
		state.militaryDepth++
		switch (type) {
			case EVENT_HEAP.evt.WAR:
				WAR.runWar({ state, nation: dataBuf[0], rng })
				break
			case EVENT_HEAP.evt.SIEGE:
				SIEGE.tick({ state, warIdx: dataBuf[0], rng })
				break
			case EVENT_HEAP.evt.BATTLE:
				BATTLE.runBattle({
					state,
					warIdx: dataBuf[0],
					eventAttacker: dataBuf[1],
					rng,
				})
				break
			case EVENT_HEAP.evt.SUCCESSION:
				SUCCESSION.runSuccession({
					state,
					person: dataBuf[0],
					revision: dataBuf[1],
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
				TAX.previewBudget({ state })
				MILITARY.recordArmies({ state })
				break
			case EVENT_HEAP.evt.RAID:
				RAID.runRaid({ state, nation: dataBuf[0], rng })
				break
			case EVENT_HEAP.evt.PEOPLE_YEAR:
				PEOPLE_EVENTS.runYear({ state, rng })
				SUCCESSION.runYear({ state, rng })
				break
			case EVENT_HEAP.evt.DIPLOMACY:
				DIPLOMACY.runDiplomacy({ state, nation: dataBuf[0], rng })
				break
			case EVENT_HEAP.evt.REGENT_DEATH:
				REGENCY.regentDied({
					state,
					realm: dataBuf[0],
					regent: dataBuf[1],
				})
				break
			case EVENT_HEAP.evt.REGENCY:
				REGENCY.comeOfAge({
					state,
					realm: dataBuf[0],
					leader: dataBuf[1],
				})
				break
		}
		state.militaryDepth--
		MILITARY.reconcile({ state })
		JOURNAL.flush({
			state,
			noteCursor,
			census: type === EVENT_HEAP.evt.CENSUS,
			initial: false,
		})
		if (validate) {
			STATE.validateLiveHierarchy({
				state,
				context: `after event type=${type} data=[${dataBuf[0]},${dataBuf[1]},${dataBuf[2]},${dataBuf[3]}] time=${state.time}`,
			})
		}
	}
}

function simulateUntil({
	state,
	targetTimeMs,
	rng,
	validate,
}: SimulateUntilParams): void {
	processEventsUntil({ state, targetTime: targetTimeMs, rng, validate })
	state.time = targetTimeMs
}

export const SIM_ENGINE = {
	initHistory,
	simulateUntil,
}
