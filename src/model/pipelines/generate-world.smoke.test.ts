import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { LANDMARK_TYPE_LAKE } from "@/model/terrain/landmarks"
import type { GenesisParams } from ".."
import { generateGenesisWorld } from "./generate-world"

const TEST_NUM_POINTS = 700
const worldCache = new Map<string, ReturnType<typeof generateGenesisWorld>>()

function makeParams(overrides: Partial<GenesisParams> = {}): GenesisParams {
	return {
		seed: 12345,
		numPoints: TEST_NUM_POINTS,
		numPlates: 12,
		landDistribution: 0.25,
		continentSizeVariety: 0.35,
		landCoverage: 0.3,
		jitter: 0.5,
		roughness: 0.25,
		terrainWarp: 0,
		smoothing: 0,
		hydraulicErosion: 0,
		thermalErosion: 0,
		ridgeSharpening: 0,
		glacialErosion: 0,
		seaLevel: 1,
		volcanism: 0,
		craters: 0,
		planetRadiusKm: 6371,
		obliquity: 23.5,
		eccentricity: 0.0167,
		spectralClass: "G",
		starSubtype: 2,
		orbitalDistanceAU: 1.0,
		daysPerYear: 365,
		hoursPerDay: 24,
		tidallyLocked: false,
		antistellarLon: 180,
		perihelion: 102,
		pressure: 1.0,
		...overrides,
	}
}

function getCachedWorld(overrides: Partial<GenesisParams> = {}) {
	const params = makeParams(overrides)
	const key = JSON.stringify(params)
	const cached = worldCache.get(key)
	if (cached) return cached
	const world = generateGenesisWorld(params)
	worldCache.set(key, world)
	return world
}

function countHotspotExposure(
	hotspot: Float32Array,
	mask: Uint8Array,
	threshold: number,
): number {
	let count = 0
	for (let r = 0; r < hotspot.length; r++) {
		if (hotspot[r] > threshold && mask[r]) count++
	}
	return count
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

describe("generateGenesisWorld", () => {
	it(
		"produces a fully-populated world in active mode",
		() => {
			const world = getCachedWorld({ seed: 2024, numPoints: 700 })
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
			expect(world.volcanism.mantleUpwelling.length).toBe(N)
			expect(world.volcanism.hotspotExposure).toBeDefined()

			expect(world.provinces).toBeDefined()
			expect(world.nations).toBeDefined()
			expect(world.cultures).toBeDefined()
			expect(world.heritages).toBeDefined()
			expect(world.religions).toBeDefined()
			expect(world.religionTypes).toBeDefined()
			expect(world.population).toBeDefined()
			expect(world.landmarks).toBeDefined()
		},
		TEST_TIMEOUT,
	)

	it(
		"produces an all-ocean world when landCoverage=0",
		() => {
			const world = getCachedWorld({
				landCoverage: 0,
				seed: 2025,
				numPoints: 500,
			})
			const isLand = world.isLand!
			let landCells = 0
			for (let r = 0; r < isLand.length; r++) if (isLand[r]) landCells++
			expect(landCells).toBe(0)
			for (let r = 0; r < world.volcanism!.hotspot.length; r++) {
				expect(world.volcanism!.hotspot[r]).toBe(0)
			}
			expect(world.volcanism.hotspotExposure).toEqual({
				threshold: 0.01,
				activeCells: 0,
				aboveWaterBeforeFlood: 0,
				aboveWaterAfterFlood: 0,
			})
			expect(world.volcanism.mantleUpwelling.length).toBe(world.mesh.numRegions)
		},
		TEST_TIMEOUT,
	)

	it(
		"produces an all-land world when landCoverage=1",
		() => {
			const world = getCachedWorld({
				landCoverage: 1,
				seed: 2026,
				numPoints: 500,
			})
			const isLand = world.isLand!
			let oceanCells = 0
			for (let r = 0; r < isLand.length; r++) if (!isLand[r]) oceanCells++
			expect(oceanCells).toBeLessThan(isLand.length * 0.02)
		},
		TEST_TIMEOUT,
	)

	it(
		"applies sea level after terrain shaping and changes final land coverage",
		() => {
			const baseline = getCachedWorld({
				seed: 2120,
				numPoints: 700,
				seaLevel: 1,
			})
			const flooded = getCachedWorld({
				seed: 2120,
				numPoints: 700,
				seaLevel: 1.35,
			})

			let baselineLand = 0
			let floodedLand = 0
			for (let r = 0; r < baseline.isLand.length; r++) {
				if (baseline.isLand[r]) baselineLand++
				if (flooded.isLand[r]) floodedLand++
			}

			expect(floodedLand).toBeLessThan(baselineLand)
			expect(flooded.elevation).not.toEqual(baseline.elevation)
		},
		TEST_TIMEOUT,
	)

	it(
		"keeps positive km-space cells classified as land after sea-level remapping",
		() => {
			const lowered = getCachedWorld({
				seed: 2121,
				numPoints: 700,
				seaLevel: 0.65,
			})
			for (let r = 0; r < lowered.mesh.numRegions; r++) {
				if (lowered.elevation_km[r] <= 0) continue
				const lid = lowered.landmarks?.regionLandmark[r] ?? -1
				if (lid >= 0 && lowered.landmarks?.type[lid] === LANDMARK_TYPE_LAKE)
					continue
				expect(lowered.isLand[r]).toBe(1)
			}
		},
		TEST_TIMEOUT,
	)

	it(
		"skips the super-plates path for numPlates < 8",
		() => {
			const world = getCachedWorld({ numPlates: 4, seed: 2027, numPoints: 500 })
			expect(world.plates.length).toBe(4)
			expect(world.mesh.numRegions).toBeGreaterThan(0)
		},
		TEST_TIMEOUT,
	)

	it(
		"is deterministic for a given seed",
		() => {
			const params = makeParams({ seed: 777, numPoints: 400 })
			const a = generateGenesisWorld(params)
			const b = generateGenesisWorld(params)
			expect(a.mesh.numRegions).toBe(b.mesh.numRegions)
			expect(a.elevation).toEqual(b.elevation)
			expect(a.isLand).toEqual(b.isLand)
			expect(a.plateAssignment).toEqual(b.plateAssignment)
			expect(a.volcanism.mantleUpwelling).toEqual(b.volcanism.mantleUpwelling)
			expect(a.volcanism.hotspotExposure).toEqual(b.volcanism.hotspotExposure)
		},
		TEST_TIMEOUT,
	)

	it(
		"tracks hotspot cells kept above water before and after flood fill",
		() => {
			const world = getCachedWorld({ seed: 2024, numPoints: 700, volcanism: 4 })
			const exposure = world.volcanism.hotspotExposure
			expect(exposure).toBeDefined()
			expect(exposure!.activeCells).toBeGreaterThan(0)
			expect(exposure!.aboveWaterBeforeFlood).toBeGreaterThanOrEqual(
				exposure!.aboveWaterAfterFlood,
			)
			expect(exposure!.aboveWaterAfterFlood).toBe(
				countHotspotExposure(
					world.volcanism.hotspot,
					world.isLand,
					exposure!.threshold,
				),
			)
		},
		TEST_TIMEOUT,
	)

	it(
		"holds pipeline invariants on a normal world",
		() => {
			const world = getCachedWorld({ seed: 2024, numPoints: 700 })
			const N = world.mesh.numRegions
			const isLand = world.isLand!
			const elevation = world.elevation
			const landmarks = world.landmarks
			const isLakeLandmark = (region: number) => {
				if (!landmarks) return false
				const landmark = landmarks.regionLandmark[region]
				return landmark >= 0 && landmarks.type[landmark] === LANDMARK_TYPE_LAKE
			}
			const regionProvince = world.provinces!.regionProvince

			for (let r = 0; r < N; r++) {
				if (isLand[r]) {
					expect(elevation[r] > 0 || isLakeLandmark(r)).toBe(true)
				}
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
			const world = getCachedWorld({ seed: 2024, numPoints: 700 })
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
