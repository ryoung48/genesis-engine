import { vi } from "vitest"
import { generateOrogenWorld } from "../pipeline"
import type { OrogenParams, OrogenWorld } from "../types"

export function makeTestParams(
	overrides: Partial<OrogenParams> = {},
): OrogenParams {
	return {
		seed: 12345,
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

export function silenceConsoleTimings(): void {
	vi.spyOn(console, "time").mockImplementation(() => undefined)
	vi.spyOn(console, "timeEnd").mockImplementation(() => undefined)
	vi.spyOn(console, "table").mockImplementation(() => undefined)
}

const worldCache = new Map<string, OrogenWorld>()

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
