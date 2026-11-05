import { describe, expect, it } from "vitest"
import { HISTORY } from "@/model/history/record"
import { PROVINCE_STATUS } from "@/model/history/record/status"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { SIM_RECORD } from "@/model/history/sim/record"
import { TARGET_PROFILE } from "@/model/history/sim/targets"
import { ERAS } from "@/model/society/eras"
import { MIGRATION } from "@/model/society/migration"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"

const POINTS = 204000

function create() {
	return HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: POINTS,
	})
}

function stepTo(state: HistoryState, year: number, seed = 14963991) {
	SIM_ENGINE.simulateUntil({
		state,
		targetTimeMs: year * STATE.yearMs,
		rng: HISTORY_RNG.createHistoryRng(seed + 99999),
		validate: false,
	})
}

function held(state: HistoryState, p: number) {
	return !state.desolate[p] && !state.stateless[p]
}

describe("target profile", () => {
	it("rises from the isolated to the connected held share with contact age", () => {
		const share = (years: number) => TARGET_PROFILE.contactShare({ years })
		expect(share(-100)).toBeCloseTo(0.28, 10)
		expect(share(0)).toBeCloseTo(0.28, 10)
		expect(share(1200)).toBeCloseTo(0.28 + 0.667 * (1 - Math.exp(-1)), 10)
		expect(share(1e9)).toBeCloseTo(0.947, 10)
	})

	it("sums every size row to one hundred percent", () => {
		for (const year of [867, 1066, 1300, 1701, 1800])
			expect(
				TARGET_PROFILE.at({
					year,
					habitableProvinces: 10974,
				}).sizeShares.reduce((sum, share) => sum + share, 0),
			).toBeCloseTo(1, 10)
	})

	it("starts from the normalised late medieval weights", () => {
		const weights = ERAS.getEraConfig("lateMedieval").nationPercentages
		const bucketShares = [
			weights[6],
			weights[5],
			weights[4],
			weights[3],
			weights[2],
			weights[1] * 0.368,
			weights[1] * 0.632,
		]
		const total = bucketShares.reduce((sum, share) => sum + share, 0)
		const profile = TARGET_PROFILE.at({ year: 867, habitableProvinces: 10974 })
		bucketShares.forEach((share, b) =>
			expect(profile.sizeShares[b]).toBeCloseTo(share / total, 3),
		)
	})

	it("interpolates the state-held share and steps the size ceiling", () => {
		const at = (year: number) =>
			TARGET_PROFILE.at({ year, habitableProvinces: 10974 })
		expect(at(867).stateHeld).toBeCloseTo(0.566, 3)
		expect(at(1066).stateHeld).toBeCloseTo(0.6, 10)
		expect(at(1800).stateHeld).toBeCloseTo(0.864, 3)
		expect(at(1065).ceiling).toBe(809)
		expect(at(1066).ceiling).toBe(1870)
		expect(at(1701).ceiling).toBe(2014)
	})

	it("scales the ceiling with the habitable province count", () => {
		expect(
			TARGET_PROFILE.at({ year: 1500, habitableProvinces: 5487 }).ceiling,
		).toBe(935)
	})
})

describe("generated land status", () => {
	it("holds the target share of habitable provinces, all settled, with cradles apart", () => {
		const { engine, generated } = create()
		let heldCount = 0
		let habitable = 0
		let uninhabited = 0
		for (let p = 0; p < engine.P; p++) {
			if (engine.desolate[p]) continue
			habitable++
			if (engine.uninhabited[p]) uninhabited++
			if (!held(engine, p)) continue
			heldCount++
			expect(engine.settledYear[p]).toBeLessThanOrEqual(867)
		}
		const target = TARGET_PROFILE.at({
			year: 867,
			habitableProvinces: habitable,
		})
		expect(heldCount).toBe(
			Math.round(target.stateHeld * (habitable - uninhabited)),
		)
		const cradles = generated.population?.cradles ?? []
		expect(cradles.length).toBeLessThanOrEqual(8)
		for (const cradle of cradles)
			expect(cradle.residenceYears).toBeGreaterThanOrEqual(2000)
		const { r_xyz } = generated.mesh
		const seeds = generated.provinces?.seeds as Int32Array
		const radius = generated.params.planetRadiusKm ?? 6371
		const spacing = (2000 * radius) / 6371
		for (let a = 0; a < cradles.length; a++)
			for (let b = a + 1; b < cradles.length; b++) {
				const x = seeds[cradles[a].province] * 3
				const y = seeds[cradles[b].province] * 3
				const cos =
					r_xyz[x] * r_xyz[y] +
					r_xyz[x + 1] * r_xyz[y + 1] +
					r_xyz[x + 2] * r_xyz[y + 2]
				expect(Math.acos(Math.min(1, cos)) * radius).toBeGreaterThanOrEqual(
					spacing,
				)
			}
	})

	it("starts the realm sizes on the target profile", () => {
		const { engine } = create()
		const sizes = new Array<number>(TARGET_PROFILE.bucketCount).fill(0)
		let held = 0
		for (let p = 0; p < engine.P; p++) {
			if (
				engine.desolate[p] ||
				engine.stateless[p] ||
				engine.parentCurrent[p] >= 0
			)
				continue
			const size = STATE.getNationProvinces({ state: engine, root: p }).length
			sizes[TARGET_PROFILE.bucketOf({ size })] += size
			held += size
		}
		const target = TARGET_PROFILE.at({ year: 867, habitableProvinces: held })
		sizes.forEach((size, b) =>
			expect(Math.abs(size / held - target.sizeShares[b])).toBeLessThan(0.025),
		)
	})

	it("never places people on uninhabited land", () => {
		const { engine } = create()
		for (let p = 0; p < engine.P; p++)
			if (engine.uninhabited[p]) {
				expect(engine.stateless[p]).toBe(1)
				expect(engine.popRuralCurrent[p] + engine.popUrbanCurrent[p]).toBe(0)
				expect(MIGRATION.sentinel).toBeGreaterThanOrEqual(engine.settledYear[p])
			}
	})
})

describe("state emergence", () => {
	it("absorbs stateless land but never uninhabited land", () => {
		const { engine } = create()
		const before = Uint8Array.from(engine.uninhabited)
		engine.land.habitable = Math.round(engine.land.habitable * 1.3)
		const start = Math.round(engine.time / STATE.yearMs)
		stepTo(engine, start + 1)
		expect(engine.land.counters.absorptions).toBeGreaterThan(0)
		expect(engine.land.counters.absorptionViolations).toBe(0)
		for (let p = 0; p < engine.P; p++)
			if (before[p] && engine.settledYear[p] > start + 1) {
				expect(engine.uninhabited[p]).toBe(1)
				expect(held(engine, p)).toBe(false)
			}
	}, 120_000)
})

describe("settlement", () => {
	it("moves population from the predecessor and turns the status over on arrival", () => {
		const { engine, generated } = create()
		const world = generated as unknown as SerializedGenesisWorld
		const state = SIM_RECORD.buildProceduralState({
			world,
			startTimeMs: engine.time,
		})
		const translator = SIM_RECORD.createTranslator({ state, world })
		SIM_RECORD.consumeJournal({ translator, transactions: engine.journal })
		JOURNAL.releaseSent(engine)
		const start = Math.round(engine.time / STATE.yearMs)
		const land = engine.land
		let p = -1
		for (let i = land.cursor; i < land.order.length && p < 0; i++) {
			const candidate = land.order[i]
			const predecessor = land.predecessor[candidate]
			if (
				predecessor >= 0 &&
				!engine.uninhabited[predecessor] &&
				engine.stateless[predecessor] &&
				engine.popRuralCurrent[predecessor] > 0
			) {
				p = candidate
				land.order[i] = land.order[land.cursor]
				land.order[land.cursor] = candidate
			}
		}
		expect(p).toBeGreaterThanOrEqual(0)
		const predecessor = land.predecessor[p]
		const ruralBefore = engine.popRuralCurrent[predecessor]
		engine.settledYear[p] = start + 1
		stepTo(engine, start + 1)
		SIM_RECORD.consumeJournal({ translator, transactions: engine.journal })
		JOURNAL.releaseSent(engine)
		expect(engine.uninhabited[p]).toBe(0)
		expect(engine.stateless[p]).toBe(1)
		const total =
			engine.popRuralCurrent[p] + engine.popRuralCurrent[predecessor]
		expect(engine.popRuralCurrent[p]).toBeGreaterThan(0)
		const growth = total / ruralBefore
		expect(growth).toBeGreaterThan(0.9)
		expect(growth).toBeLessThan(1.2)
		const own = engine.habitability[p]
		const source = engine.habitability[predecessor]
		expect(engine.popRuralCurrent[p] / total).toBeCloseTo(
			own / (own + source),
			2,
		)
		const frame = (timeMs: number) => HISTORY.frameAt({ state, timeMs })
		const arrival = state.record.events.provinceEvents
			.get(p)
			?.events.find((event) => event.kind === "status")
		expect(arrival?.payload.status).toBe(PROVINCE_STATUS.code.stateless)
		expect(frame((arrival?.timeMs ?? 0) - 1).provinceStatus?.[p]).toBe(
			PROVINCE_STATUS.code.uninhabited,
		)
		expect(frame(arrival?.timeMs ?? 0).provinceStatus?.[p]).toBe(
			PROVINCE_STATUS.code.stateless,
		)
	}, 120_000)
})
