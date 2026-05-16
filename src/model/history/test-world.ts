import { vi } from "vitest"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import type { OrogenParams, OrogenWorld } from ".."
import { generateOrogenWorld } from "../pipelines/generate-world"

export const TEST_WORLD_NUM_POINTS = 600

function makeTestParams(overrides: Partial<OrogenParams> = {}): OrogenParams {
	return {
		...DEFAULT_WORLD_PARAMS,
		tectonicMode: "active",
		seed: 12345,
		numPoints: TEST_WORLD_NUM_POINTS,
		tidallyLocked: false,
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
