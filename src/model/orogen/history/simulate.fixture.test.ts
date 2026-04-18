import { beforeAll, describe, expect, it } from "vitest"
import { getCachedWorld, silenceConsoleTimings } from "../__fixtures__/world"
import { PROV } from "./fields"
import { createHistoryRng, initHistory, simulateUntil, YEAR_MS } from "./index"
import { type HistoryState, validateLiveHierarchy } from "./state"

function seedState(): HistoryState {
	const world = getCachedWorld()
	return initHistory({
		nations: world.nations!,
		provinces: world.provinces!,
		population: world.population!,
		coastal: world.coastal!,
		riverVisible: world.rivers!.visible,
		r_xyz: world.mesh.r_xyz,
		cultures: world.cultures!,
		seed: world.params.seed,
	})
}

describe("simulateUntil", () => {
	beforeAll(silenceConsoleTimings)

	it("advancesStateTimeToTargetExactly", () => {
		const state = seedState()
		const rng = createHistoryRng(1)
		const target = state.time + 25 * YEAR_MS

		simulateUntil(state, target, rng)

		expect(state.time).toBe(target)
	})

	it("keepsHierarchyValidAfterSimulation", () => {
		const state = seedState()
		const rng = createHistoryRng(2)

		simulateUntil(state, state.time + 25 * YEAR_MS, rng)

		expect(() =>
			validateLiveHierarchy(state, "test-post-simulate"),
		).not.toThrow()
	})

	it("preservesProvinceCount", () => {
		const state = seedState()
		const before = state.P
		const rng = createHistoryRng(3)

		simulateUntil(state, state.time + 25 * YEAR_MS, rng)

		expect(state.P).toBe(before)
	})

	it("keepsRuralPopulationNonNegative", () => {
		const state = seedState()
		const rng = createHistoryRng(4)

		simulateUntil(state, state.time + 25 * YEAR_MS, rng)

		for (let p = 0; p < state.P; p++) {
			expect(PROV.population.rural.get(state, p)).toBeGreaterThanOrEqual(0)
		}
	})

	it("keepsUrbanPopulationNonNegative", () => {
		const state = seedState()
		const rng = createHistoryRng(5)

		simulateUntil(state, state.time + 25 * YEAR_MS, rng)

		for (let p = 0; p < state.P; p++) {
			expect(PROV.population.urban.get(state, p)).toBeGreaterThanOrEqual(0)
		}
	})

	it("keepsParentChainAcyclicAfterSimulation", () => {
		const state = seedState()
		const rng = createHistoryRng(6)

		simulateUntil(state, state.time + 25 * YEAR_MS, rng)

		for (let p = 0; p < state.P; p++) {
			let cur = p
			let steps = 0
			while (PROV.parent.get(state, cur) >= 0) {
				cur = PROV.parent.get(state, cur)
				steps++
				if (steps > state.P) break
			}
			expect(steps).toBeLessThanOrEqual(state.P)
		}
	})

	it("isDeterministicForSameRngSeed", () => {
		const stateA = seedState()
		const stateB = seedState()
		const rngA = createHistoryRng(77)
		const rngB = createHistoryRng(77)
		const target = stateA.time + 25 * YEAR_MS

		simulateUntil(stateA, target, rngA)
		simulateUntil(stateB, target, rngB)

		for (let p = 0; p < stateA.P; p++) {
			expect(PROV.parent.get(stateA, p)).toBe(PROV.parent.get(stateB, p))
			expect(PROV.assignment.get(stateA, p)).toBe(
				PROV.assignment.get(stateB, p),
			)
		}
	})
})
