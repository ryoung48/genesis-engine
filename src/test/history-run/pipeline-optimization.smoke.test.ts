import { expect, it } from "vitest"
import { HISTORY } from "@/model/history/record"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { SIM_RECORD } from "@/model/history/sim/record"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"

it("preserves hierarchy traversal and population summation order", () => {
	const engine = {
		hierarchyDirty: false,
		childOffset: new Int32Array([0, 2, 3, 4, 4, 4]),
		childList: new Int32Array([1, 2, 3, 4]),
		popRuralCurrent: new Float64Array([1e16, 1, 1, 1, 1]),
		popUrbanCurrent: new Float64Array(5),
	} as unknown as HistoryState
	expect(STATE.getNationProvinces({ state: engine, root: 0 })).toEqual([
		0, 1, 2, 4, 3,
	])
	expect(STATE.getNationPopulation({ state: engine, root: 0 })).toBe(1e16)
	expect(STATE.getNationProvinces({ state: engine, root: 1 })).toEqual([1, 3])
	expect(STATE.getNationPopulation({ state: engine, root: 1 })).toBe(2)
	expect(STATE.getNationProvinces({ state: engine, root: 4 })).toEqual([4])
	expect(STATE.getNationPopulation({ state: engine, root: 4 })).toBe(1)
})

it("keeps flushed journal snapshots intact when subsequent batches reuse buffers", () => {
	const { engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	engine.journal.length = 0
	engine.events.length = 0
	JOURNAL.occupation({ state: engine, province: 0, before: -1, after: 3 })
	JOURNAL.relation({ state: engine, x: 0, y: 1, before: 0, after: 1 })
	JOURNAL.coalition({
		state: engine,
		warId: 0,
		goal: "conquest",
		attackers: [0],
		defenders: [1],
	})
	engine.people.log.pregnancies.push({
		mother: 0,
		father: 1,
		time: 1,
		outcome: "childbirth death",
	})
	JOURNAL.flush({ state: engine, noteCursor: 0, census: false, initial: false })
	const first = structuredClone(engine.journal[0])
	JOURNAL.occupation({ state: engine, province: 0, before: 3, after: 4 })
	JOURNAL.relation({ state: engine, x: 0, y: 1, before: 1, after: 2 })
	JOURNAL.coalition({
		state: engine,
		warId: 1,
		goal: "conquest",
		attackers: [1],
		defenders: [0],
	})
	engine.people.log.pregnancies.push({
		mother: 1,
		father: 0,
		time: 2,
		outcome: "stillbirth",
	})
	JOURNAL.flush({ state: engine, noteCursor: 0, census: false, initial: false })
	expect(engine.journal).toHaveLength(2)
	expect(engine.journal[0]).toEqual(first)
	expect(engine.journal[1].occupations).toEqual([
		{ province: 0, before: 3, after: 4 },
	])
	expect(engine.journal[1].people.pregnancies).toEqual([
		{ mother: 1, father: 0, timeMs: STATE.yearMs * 2, outcome: "stillbirth" },
	])
	JOURNAL.flush({ state: engine, noteCursor: 0, census: false, initial: false })
	expect(engine.journal).toHaveLength(2)
	JOURNAL.occupation({ state: engine, province: 0, before: 4, after: 5 })
	JOURNAL.occupation({ state: engine, province: 0, before: 5, after: 4 })
	JOURNAL.flush({ state: engine, noteCursor: 0, census: false, initial: false })
	expect(engine.journal).toHaveLength(2)
})

it("builds the same complete record while releasing translated journal batches", () => {
	const seed = 14963991
	const { generated, engine } = HISTORY_RUN.createEngine({
		seed,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const world = generated as unknown as SerializedGenesisWorld
	const startTimeMs = engine.time
	const streamed = SIM_RECORD.buildProceduralState({ world, startTimeMs })
	const batched = SIM_RECORD.buildProceduralState({ world, startTimeMs })
	const translator = SIM_RECORD.createTranslator({ state: streamed, world })
	const queue = structuredClone(engine.journal, {
		transfer: JOURNAL.transferList(engine.journal),
	})
	const all = queue.slice()
	JOURNAL.releaseSent(engine)
	SIM_RECORD.consumeJournal({ translator, transactions: queue })
	expect(queue).toHaveLength(0)
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	for (let year = 1; year <= 20; year++) {
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: startTimeMs + STATE.deltaYear(year),
			rng,
			validate: false,
		})
		queue.push(
			...structuredClone(engine.journal, {
				transfer: JOURNAL.transferList(engine.journal),
			}),
		)
		all.push(...queue)
		JOURNAL.releaseSent(engine)
		SIM_RECORD.consumeJournal({ translator, transactions: queue })
		expect(queue).toHaveLength(0)
		expect(engine.journal).toHaveLength(0)
		expect(engine.events).toHaveLength(0)
	}
	SIM_RECORD.appendJournal({
		translator: SIM_RECORD.createTranslator({ state: batched, world }),
		transactions: all,
	})
	expect(streamed.record).toEqual(batched.record)
	for (const census of streamed.record.events.censuses.toReversed()) {
		for (const timeMs of [census.timeMs, census.timeMs + STATE.yearMs / 2]) {
			const frame = HISTORY.frameAt({ state: streamed, timeMs })
			expect(frame).toEqual(HISTORY.frameAt({ state: batched, timeMs }))
			expect(frame.provincePopulation).toBe(census.rural)
			expect(frame.provincePopulationUrban).toBe(census.urban)
			expect(frame.provinceDevelopment).toBe(census.development)
		}
	}
})
