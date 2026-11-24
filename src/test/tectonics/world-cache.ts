import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { GenesisParams, GenesisWorld } from "@/model/pipelines/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const worlds = new Map<string, GenesisWorld>()

export function generateWorld(
	overrides: Partial<GenesisParams> & { seed: number },
): GenesisWorld {
	return GENERATE_WORLD.generateGenesisWorld({
		params: { ...DEFAULT_WORLD_PARAMS, tideLock: null, ...overrides },
	})
}

export function cachedWorld(seed: number): GenesisWorld {
	const key = String(seed)
	let world = worlds.get(key)
	if (!world) {
		world = generateWorld({ seed })
		worlds.set(key, world)
	}
	return world
}
