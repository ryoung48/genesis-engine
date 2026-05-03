import { vi } from "vitest"
import type { OrogenParams, OrogenWorld } from ".."
import { generateOrogenWorld } from "../pipelines/generate-world"

export const TEST_WORLD_NUM_POINTS = 600

function makeTestParams(overrides: Partial<OrogenParams> = {}): OrogenParams {
	return {
		seed: 12345,
		tectonicMode: "active",
		numPoints: TEST_WORLD_NUM_POINTS,
		numPlates: 12,
		landDistribution: 0.25,
		continentSizeVariety: 0.35,
		landCoverage: 0.45,
		jitter: 0.5,
		roughness: 0.25,
		terrainWarp: 0,
		smoothing: 0,
		hydraulicErosion: 0,
		thermalErosion: 0,
		ridgeSharpening: 0,
		glacialErosion: 0,
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

let consoleTimingsSilenced = false

function silenceConsoleTimings(): void {
	if (consoleTimingsSilenced) return
	vi.spyOn(console, "time").mockImplementation(() => undefined)
	vi.spyOn(console, "timeEnd").mockImplementation(() => undefined)
	vi.spyOn(console, "table").mockImplementation(() => undefined)
	consoleTimingsSilenced = true
}

const worldCache = new Map<string, OrogenWorld>()

export function clearWorldCacheForTests(): void {
	worldCache.clear()
}

export function getCachedWorld(
	overrides: Partial<OrogenParams> = {},
): OrogenWorld {
	const params = makeTestParams(overrides)
	const key = JSON.stringify(params)
	const existing = worldCache.get(key)
	if (existing) return existing
	silenceConsoleTimings()
	const world = generateOrogenWorld(params)
	worldCache.set(key, world)
	return world
}
