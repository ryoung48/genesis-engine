import { describe, expect, it } from "vitest"
import { createHistoryTestState, createStubRng } from "./event-test-utils"
import { runWar } from "./war"

describe("war events — rebellion", () => {
	it("direct subject rebels when strong enough relative to the sovereign", () => {
		// Province 0: weak sovereign (habitability 1)
		// Province 1: strong direct vassal of 0 (habitability 10)
		// warThreat(0 vs 1) ≈ 0.98 > 0.4, rng returns 0.5 < 0.98 → rebellion fires
		const state = createHistoryTestState({
			parent: [-1, 0],
			habitability: [1, 10],
			neighbors: [[1], [0]],
		})

		runWar(state, 1, createStubRng([0.5]))

		const rebellions = state.events.filter((e) => e.tag === "rebellion")
		expect(rebellions).toHaveLength(1)
		expect(rebellions[0]!.data).toMatchObject({ overlord: 0, subject: 1 })
	})

	it("sub-vassal does not rebel against the top sovereign", () => {
		// Province 0: weak sovereign (habitability 1)
		// Province 1: direct vassal of 0 (habitability 10)
		// Province 2: vassal of 1 — grandchild of sovereign 0 (habitability 10)
		// Province 2's immediate parent (1) ≠ sovereign (0) → no rebellion
		const state = createHistoryTestState({
			parent: [-1, 0, 1],
			habitability: [1, 10, 10],
			neighbors: [
				[1, 2],
				[0, 2],
				[1, 0],
			],
		})

		runWar(state, 2, createStubRng([0.5]))

		const rebellions = state.events.filter((e) => e.tag === "rebellion")
		expect(rebellions).toHaveLength(0)
	})

	it("sovereign nation does not enter the rebellion branch", () => {
		const state = createHistoryTestState({
			parent: [-1, -1],
			habitability: [10, 10],
			neighbors: [[1], [0]],
		})

		runWar(state, 0, createStubRng([0.5]))

		const rebellions = state.events.filter((e) => e.tag === "rebellion")
		expect(rebellions).toHaveLength(0)
	})

	it("rebellion does not fire when threat is too low", () => {
		// Province 0: very strong sovereign (habitability 100)
		// Province 1: weak direct vassal (habitability 1)
		// warThreat(0 vs 1) will be well below 0.4 → no rebellion
		const state = createHistoryTestState({
			parent: [-1, 0],
			habitability: [100, 1],
			neighbors: [[1], [0]],
		})

		runWar(state, 1, createStubRng([0.5]))

		const rebellions = state.events.filter((e) => e.tag === "rebellion")
		expect(rebellions).toHaveLength(0)
	})
})
