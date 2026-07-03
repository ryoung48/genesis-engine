import { vi } from "vitest"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import type { GenesisParams, GenesisWorld } from ".."
import { generateGenesisWorld } from "../pipelines/generate-world"

const TEST_WORLD_NUM_POINTS = 600

function makeTestParams(overrides: Partial<GenesisParams> = {}): GenesisParams {
	return {
		...DEFAULT_WORLD_PARAMS,
		seed: 0,
		tideLock: null,
		planetType: "terrestrial",
		numPoints: TEST_WORLD_NUM_POINTS,
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

const worldCache = new Map<string, GenesisWorld>()

export function getCachedWorld(
	overrides: Partial<GenesisParams> = {},
): GenesisWorld {
	const params = makeTestParams(overrides)
	const key = JSON.stringify(params)
	const existing = worldCache.get(key)
	if (existing) return existing
	silenceConsoleTimings()
	const world = generateGenesisWorld(params)
	worldCache.set(key, world)
	return world
}
