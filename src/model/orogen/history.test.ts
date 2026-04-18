import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import {
	createHistoryRng,
	initHistory,
	simulateUntil,
	YEAR_MS,
} from "./history"
import { validateLiveHierarchy } from "./history/state"
import { generateOrogenWorld } from "./pipeline"
import type { OrogenParams } from "./types"

function makeParams(overrides: Partial<OrogenParams> = {}): OrogenParams {
	return {
		seed: 314159,
		tectonicMode: "active",
		numPoints: 5000,
		numPlates: 12,
		landDistribution: 0.25,
		continentSizeVariety: 0.35,
		landCoverage: 0.45,
		jitter: 0.75,
		roughness: 0.4,
		terrainWarp: 0.75,
		smoothing: 0.1,
		hydraulicErosion: 0.5,
		thermalErosion: 0.1,
		ridgeSharpening: 0.5,
		glacialErosion: 0.5,
		volcanism: 0.5,
		craters: 0,
		planetRadiusKm: 6371,
		obliquity: 23.5,
		eccentricity: 0.0167,
		sunTempFactor: 1,
		daysPerYear: 365,
		hoursPerDay: 24,
		tidallyLocked: false,
		antistellarLon: 180,
		perihelion: 102,
		pressure: 1.0,
		...overrides,
	}
}

beforeAll(() => {
	vi.spyOn(console, "time").mockImplementation(() => undefined)
	vi.spyOn(console, "timeEnd").mockImplementation(() => undefined)
	vi.spyOn(console, "table").mockImplementation(() => undefined)
})

afterAll(() => {
	vi.restoreAllMocks()
})

describe("history simulation on a generated world", () => {
	it("seeds from a generated world and simulates a short span", () => {
		const world = generateOrogenWorld(makeParams())
		expect(world.nations).toBeDefined()
		expect(world.provinces).toBeDefined()
		expect(world.population).toBeDefined()
		expect(world.cultures).toBeDefined()
		expect(world.rivers?.visible).toBeDefined()
		expect(world.coastal).toBeDefined()

		const rng = createHistoryRng(world.params.seed + 99999)
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

		const target = state.time + 50 * YEAR_MS
		expect(() => simulateUntil(state, target, rng)).not.toThrow()
		expect(state.time).toBe(target)
		expect(() =>
			validateLiveHierarchy(state, "test-after-simulate"),
		).not.toThrow()
	}, 60_000)
})
