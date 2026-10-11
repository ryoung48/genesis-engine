import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { BATTLE } from "@/model/history/sim/engine/events/battle"
import { DIPLOMACY } from "@/model/history/sim/engine/events/diplomacy"
import { ROYAL_MARRIAGE } from "@/model/history/sim/engine/events/diplomacy/marriage"
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
import { ROADS } from "@/model/history/sim/engine/roads"
import type {
	ProcessEventsUntilParams,
	SeedColonyRelationsParams,
	SimulateUntilParams,
} from "@/model/history/sim/engine/simulation/types"
import { InitHistoryParams } from "@/model/history/sim/engine/simulation/types"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { TIMING } from "@/model/shared/timing"
import { UNITS } from "@/model/shared/units"
import { URBANIZATION } from "@/model/society/urbanization"

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

function initHistory(params: InitHistoryParams): HistoryState {
	const startYear = params.startYear ?? STATE.defaultStartYear
	const rng = HISTORY_RNG.createHistoryRng(params.seed + 99999)
	const state = TIMING.measure({
		stage: "initHistory:createHistoryState",
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
				heritages: params.heritages,
				religions: params.religions,
				religionGender: params.religionGender,
				startYear,
				seed: params.seed,
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

	state.knowledgeBaseline = KNOWLEDGE.startBaseline({
		era: state.era,
		startYear: params.startYear,
	})

	// Seed colony dependencies before init passes so subordinate colonies are
	// excluded from independent diplomacy and subject formation.
	seedColonyRelations({ state, nations: params.nations })

	// Population runs first: diplomacy and war seeding compare revenue and
	// armies, which read development, knowledge and the seeded economy.
	TIMING.measure({
		stage: "initHistory:initPopulation",
		timings: params.timings,
		fn: () =>
			POPULATION.initPopulation({
				state,
				urbanization: URBANIZATION.computeUrbanization({
					params: { era: state.era },
					provinces: params.provinces,
					nations: params.nations,
					population: params.population,
					knowledge: KNOWLEDGE.urbanKnowledge({
						era: state.era,
						baseline: state.knowledgeBaseline,
					}),
				}),
			}),
	})
	if (
		params.settlementRegions &&
		params.landmarks &&
		params.regionAdjOffset &&
		params.regionAdjList &&
		params.regionProvince &&
		params.regionIsLand
	)
		TIMING.measure({
			stage: "initHistory:initRoads",
			timings: params.timings,
			fn: () =>
				ROADS.init({
					state,
					world: {
						mesh: {
							r_xyz: state.r_xyz,
							adjOffset: state.regionAdjOffset,
							adjList: state.regionAdjList,
						},
						params: { era: state.era, planetRadiusKm: state.planetRadiusKm },
						provinces: {
							count: state.P,
							desolate: state.desolate,
							regionProvince: state.regionProvince,
							adjOffset: state.provinceAdjOffset,
							adjList: state.provinceAdjList,
						},
						nations: params.nations,
						landmarks: state.landmarks,
						isLand: state.regionIsLand,
					},
					inputs: {
						urbanPopulation: state.popUrbanCurrent,
						settlementRegions: params.settlementRegions?.slice(),
						settlementWaterLandmarks: params.settlementWaterLandmarks?.slice(),
						settlementPortRegions: params.settlementPortRegions?.slice(),
					},
				}),
		})
	TIMING.measure({
		stage: "initHistory:initEconomy",
		timings: params.timings,
		fn: () => ECONOMY.initEconomy({ state }),
	})
	TIMING.measure({
		stage: "initHistory:initMilitary",
		timings: params.timings,
		fn: () => MILITARY.initialize({ state }),
	})
	TIMING.measure({
		stage: "initHistory:initDiplomacy",
		timings: params.timings,
		fn: () => DIPLOMACY.initDiplomacy({ state, rng }),
	})
	state.heap.enqueue(state.time + STATE.deltaYear(1), EVENT_HEAP.evt.YEAR, 0, 0)
	TIMING.measure({
		stage: "initHistory:initWar",
		timings: params.timings,
		fn: () => WAR.initWar({ state, rng }),
	})
	TIMING.measure({
		stage: "initHistory:initTax",
		timings: params.timings,
		fn: () => TAX.initTax({ state }),
	})
	TIMING.measure({
		stage: "initHistory:initRaid",
		timings: params.timings,
		fn: () => RAID.initRaid({ state, rng }),
	})
	// Re-seed COLONY relations so init passes cannot leave them downgraded.
	seedColonyRelations({ state, nations: params.nations })

	ROYAL_MARRIAGE.review({ state })
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
		else if (type === EVENT_HEAP.evt.CENSUS || type === EVENT_HEAP.evt.YEAR)
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
					realm: dataBuf[0],
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
				ROADS.advance({ state })
				TAX.previewBudget({ state })
				MILITARY.recordArmies({ state })
				break
			case EVENT_HEAP.evt.RAID:
				RAID.runRaid({ state, nation: dataBuf[0], rng })
				break
			case EVENT_HEAP.evt.YEAR:
				state.heap.enqueue(
					state.time + STATE.deltaYear(1),
					EVENT_HEAP.evt.YEAR,
					0,
					0,
				)
				ROYAL_MARRIAGE.runYear({ state, rng })
				SUCCESSION.runYear({ state, rng })
				break
			case EVENT_HEAP.evt.DIPLOMACY:
				DIPLOMACY.runDiplomacy({ state, nation: dataBuf[0], rng })
				break
			case EVENT_HEAP.evt.REGENCY:
				REGENCY.comeOfAge({
					state,
					realm: dataBuf[0],
					leader: dataBuf[1],
					rng,
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
