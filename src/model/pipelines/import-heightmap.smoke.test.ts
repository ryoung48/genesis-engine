import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { LANDMARK_TYPE_LAKE } from "@/model/terrain/landmarks"
import type { ImportParams } from "./import-heightmap"
import { importGenesisWorld } from "./import-heightmap"

const TEST_NUM_POINTS = 200
const worldCache = new Map<string, ReturnType<typeof importGenesisWorld>>()

function makeParams(overrides: Partial<ImportParams> = {}): ImportParams {
	const grayscale = new Uint8Array(64 * 32)
	return {
		seed: 42,
		numPoints: TEST_NUM_POINTS,
		jitter: 0.5,
		grayscale,
		imageWidth: 64,
		imageHeight: 32,
		terrainWarp: 0,
		smoothing: 0,
		hydraulicErosion: 0,
		thermalErosion: 0,
		ridgeSharpening: 0,
		glacialErosion: 0,
		seaLevel: 1,
		...overrides,
	}
}

function makeGrayscale(
	width: number,
	height: number,
	value: number,
): Uint8Array {
	return new Uint8Array(width * height).fill(value)
}

function getCachedImportWorld(overrides: Partial<ImportParams> = {}) {
	const params = makeParams(overrides)
	const key = JSON.stringify({
		...params,
		grayscale: Array.from(params.grayscale),
	})
	const cached = worldCache.get(key)
	if (cached) return cached
	const world = importGenesisWorld(params)
	worldCache.set(key, world)
	return world
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

describe("importGenesisWorld", () => {
	it(
		"produces correct array sizes for all output fields",
		() => {
			const world = getCachedImportWorld()
			const N = world.mesh.numRegions

			expect(N).toBeGreaterThan(0)
			expect(world.elevation.length).toBe(N)
			expect(world.elevation_km.length).toBe(N)
			expect(world.isLand.length).toBe(N)
			expect(world.plateAssignment.length).toBe(N)
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
			expect(world.volcanism.mantleUpwelling.length).toBe(N)
			expect(world.iceThickness.length).toBe(N)
			expect(world.dtr_annual.length).toBe(N)
			expect(world.oceanDist.length).toBe(N)
		},
		TEST_TIMEOUT,
	)

	it(
		"is deterministic for a given seed",
		() => {
			const p = makeParams({ seed: 99 })
			const a = importGenesisWorld(p)
			const b = importGenesisWorld(p)
			expect(a.mesh.numRegions).toBe(b.mesh.numRegions)
			expect(a.elevation).toEqual(b.elevation)
			expect(a.isLand).toEqual(b.isLand)
			expect(a.rainfall.annual).toEqual(b.rainfall.annual)
		},
		TEST_TIMEOUT,
	)

	it(
		"satisfies pipeline invariants: land elevation positive, provinces match land",
		() => {
			const width = 64
			const height = 32
			const grayscale = new Uint8Array(width * height)
			grayscale.fill(255, 0, (width * height) / 2)
			const world = getCachedImportWorld({
				grayscale,
				imageWidth: width,
				imageHeight: height,
			})
			const N = world.mesh.numRegions
			const isLand = world.isLand!
			const regionProvince = world.provinces!.regionProvince

			for (let r = 0; r < N; r++) {
				if (isLand[r]) {
					const lid = world.landmarks?.regionLandmark[r] ?? -1
					const isLake =
						lid >= 0 && world.landmarks!.type[lid] === LANDMARK_TYPE_LAKE
					expect(world.elevation[r] > 0 || isLake).toBe(true)
				}
				const assigned = regionProvince[r] !== -1
				expect(assigned).toBe(isLand[r] === 1)
			}
		},
		TEST_TIMEOUT,
	)

	it(
		"builds province society data for imported land worlds",
		() => {
			const width = 64
			const height = 32
			const grayscale = new Uint8Array(width * height)
			grayscale.fill(255, 0, (width * height) / 2)
			const world = getCachedImportWorld({
				grayscale,
				imageWidth: width,
				imageHeight: height,
			})

			expect(world.provinces).toBeDefined()
			expect(world.nations).toBeDefined()
			expect(world.cultures).toBeDefined()
			expect(world.settlementRegions).toBeDefined()
			expect(world.settlementRegions?.length).toBe(world.provinces?.count)
		},
		TEST_TIMEOUT,
	)

	it(
		"produces an all-ocean world from a uniform black image",
		() => {
			const world = getCachedImportWorld({
				grayscale: makeGrayscale(64, 32, 0),
			})
			const isLand = world.isLand!
			let landCells = 0
			for (let r = 0; r < isLand.length; r++) if (isLand[r]) landCells++
			expect(landCells).toBe(0)
		},
		TEST_TIMEOUT,
	)

	it(
		"produces a mostly-land world from a uniform white image",
		() => {
			const world = getCachedImportWorld({
				grayscale: makeGrayscale(64, 32, 255),
			})
			const isLand = world.isLand!
			let landCells = 0
			for (let r = 0; r < isLand.length; r++) if (isLand[r]) landCells++
			expect(landCells).toBeGreaterThan(isLand.length * 0.95)
		},
		TEST_TIMEOUT,
	)
})
