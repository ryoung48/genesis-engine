import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import { createHistoryRng, initHistory, simulateUntil, YEAR_MS } from "."
import { getCachedWorld } from "./test-world"

beforeAll(() => {
	vi.spyOn(console, "time").mockImplementation(() => undefined)
	vi.spyOn(console, "timeEnd").mockImplementation(() => undefined)
})

afterAll(() => {
	vi.restoreAllMocks()
})

describe("history simulation performance at real world scale", () => {
	it("measures wall-clock time simulating 800->1444 at DEFAULT_WORLD_PARAMS scale", () => {
		const world = getCachedWorld({ numPoints: DEFAULT_WORLD_PARAMS.numPoints })

		const rng = createHistoryRng(world.params.seed + 99999)
		const initStart = performance.now()
		const state = initHistory({
			nations: world.nations!,
			provinces: world.provinces!,
			population: world.population!,
			coastal: world.coastal!,
			riverVisible: world.rivers!.visible,
			r_xyz: world.mesh.r_xyz,
			cultures: world.cultures!,
			seed: world.params.seed,
		})
		const initMs = performance.now() - initStart

		const target = state.time + 644 * YEAR_MS
		const simStart = performance.now()
		simulateUntil(state, target, rng)
		const simMs = performance.now() - simStart

		console.info(
			`P=${state.provinceSeeds.length} initHistory=${initMs.toFixed(0)}ms simulateUntil(644y)=${simMs.toFixed(0)}ms total=${(initMs + simMs).toFixed(0)}ms events=${state.events.length}`,
		)

		expect(state.time).toBe(target)
	}, 600_000)
})
