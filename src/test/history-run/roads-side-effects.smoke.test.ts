import { expect, it } from "vitest"
import { HISTORY } from "@/model/history/record"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { SIM_RECORD } from "@/model/history/sim/record"
import { TRANSLATOR } from "@/model/history/sim/record/translator"
import { HISTORY_RUN } from "@/test/history-run"
import { ROAD_HISTORY_FIXTURE } from "@/test/history-run/road-history-fixture"

it("leaves all non-road simulation state identical with settlement inputs absent", () => {
	const withRoads = ROAD_HISTORY_FIXTURE.create()
	const without = HISTORY_RUN.build({
		seed: 42,
		era: "lateMedieval",
		numPoints: 12000,
		generate: () => ({
			...withRoads.generated,
			settlementRegions: undefined,
			settlementWaterLandmarks: undefined,
			settlementPortRegions: undefined,
		}),
	})
	expect(without.engine.roads).toBeNull()
	const state = SIM_RECORD.buildProceduralState({
		world: withRoads.world,
		startTimeMs: without.engine.time,
	})
	const translator = SIM_RECORD.createTranslator({
		state,
		world: withRoads.world,
	})
	SIM_RECORD.consumeJournal({
		translator,
		transactions: without.engine.journal,
	})
	without.engine.events.length = 0
	const rng = HISTORY_RNG.createHistoryRng(42 + 99999)
	const start = withRoads.engine.time
	let withMs = 0
	let withoutMs = 0
	for (let year = 1; year <= 30; year++) {
		let time = performance.now()
		SIM_ENGINE.simulateUntil({
			state: withRoads.engine,
			targetTimeMs: start + year * STATE.yearMs,
			rng: withRoads.rng,
			validate: false,
		})
		withMs += performance.now() - time
		time = performance.now()
		SIM_ENGINE.simulateUntil({
			state: without.engine,
			targetTimeMs: start + year * STATE.yearMs,
			rng,
			validate: false,
		})
		withoutMs += performance.now() - time
		for (const field of [
			"parentCurrent",
			"sovereignCurrent",
			"occupationCurrent",
			"popUrbanCurrent",
			"popRuralCurrent",
			"developmentCurrent",
			"knowledgeCurrent",
			"wars",
			"events",
		] as const)
			expect(withRoads.engine[field]).toEqual(without.engine[field])
		SIM_RECORD.consumeJournal({
			translator: withRoads.translator,
			transactions: withRoads.engine.journal,
		})
		SIM_RECORD.consumeJournal({
			translator,
			transactions: without.engine.journal,
		})
		const timeMs = TRANSLATOR.recordTime(start + year * STATE.yearMs)
		const frameWith = HISTORY.frameAt({ state: withRoads.state, timeMs })
		const frameWithout = HISTORY.frameAt({ state, timeMs })
		expect({ ...frameWith, routes: [] }).toEqual({
			...frameWithout,
			routes: [],
		})
		for (const field of [
			"nations",
			"wars",
			"diplomacy",
			"provinceEvents",
			"titleEvents",
		] as const) {
			const withRecord =
				field === "nations"
					? withRoads.state.record.nations
					: withRoads.state.record.events[field]
			const withoutRecord =
				field === "nations" ? state.record.nations : state.record.events[field]
			expect(withRecord).toEqual(withoutRecord)
		}
		withRoads.engine.events.length = 0
		without.engine.events.length = 0
	}
	expect(withRoads.engine.roads?.batch).toBe(4)
	console.info({
		withInitMs: withRoads.engineMs,
		withoutInitMs: without.engineMs,
		withTickMs: withMs,
		withoutTickMs: withoutMs,
	})
})
