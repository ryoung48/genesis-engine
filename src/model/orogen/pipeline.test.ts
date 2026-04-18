import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { generateOrogenWorld } from "./pipeline"
import type { OrogenParams } from "./types"

function makeParams(overrides: Partial<OrogenParams> = {}): OrogenParams {
	return {
		seed: 12345,
		tectonicMode: "active",
		numPoints: 5000,
		numPlates: 12,
		landDistribution: 0.25,
		continentSizeVariety: 0.35,
		landCoverage: 0.3,
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

const TEST_TIMEOUT = 60_000

describe("generateOrogenWorld", () => {
	it(
		"produces a fully-populated world in active mode",
		() => {
			const world = generateOrogenWorld(makeParams())
			const N = world.mesh.numRegions

			expect(N).toBeGreaterThan(0)
			expect(world.elevation.length).toBe(N)
			expect(world.elevation_km.length).toBe(N)
			expect(world.isLand.length).toBe(N)
			expect(world.plateAssignment.length).toBe(N)
			expect(world.plates.length).toBe(12)

			expect(world.climate.temperature_avg.length).toBe(N)
			expect(world.climate.temperature_monthly.length).toBe(12 * N)
			expect(world.rainfall.annual.length).toBe(N)
			expect(world.rainfall.monthly.length).toBe(12 * N)
			expect(world.rivers.flow.length).toBe(N)
			expect(world.vegetation.length).toBe(N)
			expect(world.topography.length).toBe(N)
			expect(world.climateZones.length).toBe(N)
			expect(world.koppenClimate.length).toBe(N)
			expect(world.hazards.danger.length).toBe(N)
			expect(world.volcanism.hotspot.length).toBe(N)

			expect(world.provinces).toBeDefined()
			expect(world.nations).toBeDefined()
			expect(world.cultures).toBeDefined()
			expect(world.heritages).toBeDefined()
			expect(world.faiths).toBeDefined()
			expect(world.religions).toBeDefined()
			expect(world.population).toBeDefined()
			expect(world.landmarks).toBeDefined()
		},
		TEST_TIMEOUT,
	)

	it(
		"produces an all-ocean world when landCoverage=0",
		() => {
			const world = generateOrogenWorld(makeParams({ landCoverage: 0 }))
			const isLand = world.isLand!
			let landCells = 0
			for (let r = 0; r < isLand.length; r++) if (isLand[r]) landCells++
			expect(landCells).toBe(0)
			// Hotspot contribution short-circuits to zeros at landCoverage<=0.
			for (let r = 0; r < world.volcanism!.hotspot.length; r++) {
				expect(world.volcanism!.hotspot[r]).toBe(0)
			}
		},
		TEST_TIMEOUT,
	)

	it(
		"produces an all-land world when landCoverage=1",
		() => {
			const world = generateOrogenWorld(makeParams({ landCoverage: 1 }))
			const isLand = world.isLand!
			let oceanCells = 0
			for (let r = 0; r < isLand.length; r++) if (!isLand[r]) oceanCells++
			// Lakes may carve out a few cells, but the bulk should be land.
			expect(oceanCells).toBeLessThan(isLand.length * 0.02)
		},
		TEST_TIMEOUT,
	)

	it(
		"skips the super-plates path for numPlates < 8",
		() => {
			const world = generateOrogenWorld(makeParams({ numPlates: 4 }))
			expect(world.plates.length).toBe(4)
			expect(world.mesh.numRegions).toBeGreaterThan(0)
		},
		TEST_TIMEOUT,
	)

	it(
		"is deterministic for a given seed",
		() => {
			const a = generateOrogenWorld(makeParams({ seed: 777 }))
			const b = generateOrogenWorld(makeParams({ seed: 777 }))
			expect(a.mesh.numRegions).toBe(b.mesh.numRegions)
			expect(a.elevation).toEqual(b.elevation)
			expect(a.isLand).toEqual(b.isLand)
			expect(a.plateAssignment).toEqual(b.plateAssignment)
		},
		TEST_TIMEOUT,
	)

	it(
		"holds pipeline invariants on a normal world",
		() => {
			const world = generateOrogenWorld(makeParams({ seed: 2024 }))
			const N = world.mesh.numRegions
			const isLand = world.isLand!
			const elevation = world.elevation
			const lakes = world.rivers!.lakes
			const regionProvince = world.provinces!.regionProvince

			for (let r = 0; r < N; r++) {
				// Every land cell either rises above sea level or is a lake surface
				// (lakes are originally land cells that were flagged after river routing).
				if (isLand[r]) {
					expect(elevation[r] > 0 || lakes[r] === 1).toBe(true)
				}
				// Province assignment matches final land mask: land iff assigned.
				const assigned = regionProvince[r] !== -1
				expect(assigned).toBe(isLand[r] === 1)
			}

			const landCount = isLand.reduce((a, v) => a + v, 0)
			expect(world.provinces!.count).toBeLessThanOrEqual(landCount)
		},
		TEST_TIMEOUT,
	)

	it(
		"riverLand is a superset of isLand after pipeline",
		() => {
			const world = generateOrogenWorld(makeParams({ seed: 3001 }))
			const isLand = world.isLand!
			const riverLand = world.riverLand!
			for (let r = 0; r < isLand.length; r++) {
				if (isLand[r]) {
					expect(riverLand[r]).toBe(1)
				}
			}
		},
		TEST_TIMEOUT,
	)
})
