import { expect, it } from "vitest"
import { HISTORY } from "@/model/history/record"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { SIM_RECORD } from "@/model/history/sim/record"
import { TRANSLATOR } from "@/model/history/sim/record/translator"
import { ROUTES } from "@/model/society/infrastructure/trade/routing/network"
import { HISTORY_RUN } from "@/test/history-run"
import { ROAD_HISTORY_FIXTURE } from "@/test/history-run/road-history-fixture"

it("replays exact route paths at and before each ten-year batch", () => {
	const fixture = ROAD_HISTORY_FIXTURE.create()
	const { engine, state, translator, rng } = fixture
	const start = engine.time
	let previous = ROAD_HISTORY_FIXTURE.canonical({
		routes: ROUTES.stored(engine.roads!),
	})
	expect(previous.length).toBeGreaterThan(0)
	expect(
		ROAD_HISTORY_FIXTURE.canonical({
			routes: HISTORY.frameAt({ state, timeMs: TRANSLATOR.recordTime(start) })
				.routes,
		}),
	).toEqual(previous)
	for (let year = 1; year <= 30; year++) {
		SIM_ENGINE.simulateUntil({
			state: engine,
			targetTimeMs: start + year * STATE.yearMs,
			rng,
			validate: false,
		})
		SIM_RECORD.consumeJournal({ translator, transactions: engine.journal })
		if (year % 10 !== 0) continue
		const current = ROAD_HISTORY_FIXTURE.canonical({
			routes: ROUTES.stored(engine.roads!),
		})
		expect(
			ROAD_HISTORY_FIXTURE.canonical({
				routes: HISTORY.frameAt({
					state,
					timeMs: TRANSLATOR.recordTime(start + year * STATE.yearMs),
				}).routes,
			}),
		).toEqual(current)
		expect(
			ROAD_HISTORY_FIXTURE.canonical({
				routes: HISTORY.frameAt({
					state,
					timeMs: TRANSLATOR.recordTime(start + (year - 1) * STATE.yearMs),
				}).routes,
			}),
		).toEqual(previous)
		previous = current
	}
	expect(engine.roads?.batch).toBe(4)
})

it("retains routing inputs after generation buffers and journals transfer to the UI", () => {
	const original = HISTORY_RUN.createEngine({
		seed: 42,
		era: "lateMedieval",
		numPoints: 12000,
	})
	const generated = structuredClone(original.generated)
	const control = HISTORY_RUN.build({
		seed: 42,
		era: "lateMedieval",
		numPoints: 12000,
		generate: () => generated,
	})
	const world = original.generated
	const buffers = [
		...new Set([
			world.mesh.r_xyz.buffer,
			world.mesh.adjOffset.buffer,
			world.mesh.adjList.buffer,
			world.provinces!.regionProvince.buffer,
			world.provinces!.desolate.buffer,
			world.isLand.buffer,
			world.landmarks.regionLandmark.buffer,
			world.landmarks.size.buffer,
			world.settlementRegions!.buffer,
			world.settlementWaterLandmarks!.buffer,
			world.settlementPortRegions!.buffer,
		]),
	]
	structuredClone(buffers, { transfer: buffers })
	expect(world.settlementRegions!.length).toBe(0)
	structuredClone(original.engine.journal, {
		transfer: JOURNAL.transferList(original.engine.journal) as ArrayBuffer[],
	})
	JOURNAL.releaseSent(original.engine)
	JOURNAL.releaseSent(control.engine)
	const rng = HISTORY_RNG.createHistoryRng(42 + 99999)
	const controlRng = HISTORY_RNG.createHistoryRng(42 + 99999)
	const start = original.engine.time
	for (let year = 1; year <= 30; year++) {
		for (const run of [
			{ engine: original.engine, rng },
			{ engine: control.engine, rng: controlRng },
		])
			SIM_ENGINE.simulateUntil({
				state: run.engine,
				targetTimeMs: start + year * STATE.yearMs,
				rng: run.rng,
				validate: false,
			})
		structuredClone(original.engine.journal, {
			transfer: JOURNAL.transferList(original.engine.journal) as ArrayBuffer[],
		})
		JOURNAL.releaseSent(original.engine)
		JOURNAL.releaseSent(control.engine)
		expect(
			ROAD_HISTORY_FIXTURE.canonical({
				routes: ROUTES.stored(original.engine.roads!),
			}),
		).toEqual(
			ROAD_HISTORY_FIXTURE.canonical({
				routes: ROUTES.stored(control.engine.roads!),
			}),
		)
	}
	expect(original.engine.roads!.batch).toBe(4)
})
