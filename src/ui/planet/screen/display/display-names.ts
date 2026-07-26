import { createWorldNames, type LanguageNames } from "@/model/society"
import type { SerializedGenesisWorld } from "@/model/transport"

/**
 * Nation, province, culture and landmark names for the current world.
 *
 * This used to additionally override leader and dynasty names by reading the
 * procedural history sim's leaderNameSeed/leaderDynasty timelines. Leaders and
 * dynasties no longer exist on procedural worlds (Earth import sources its own
 * from the earth-history engine), so the base static implementation is used
 * unchanged.
 */
export function createDisplayNames(
	world: SerializedGenesisWorld,
): LanguageNames {
	return createWorldNames(world)
}
