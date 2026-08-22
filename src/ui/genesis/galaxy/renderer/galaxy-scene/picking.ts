import type { Galaxy } from "@/model/celestial/galaxy/types"

const PICK_RADIUS_WORLD_UNITS = 8

/** Nearest packed system to a world-space point within a fixed pick radius,
 * or -1 if nothing is close enough. Plain nearest-neighbor scan over
 * r_xy -- packed galaxies here run in the low thousands of systems at most,
 * so a spatial index isn't worth the added code. */
export function pickNearestSystem({
	galaxy,
	worldX,
	worldY,
	pickRadius = PICK_RADIUS_WORLD_UNITS,
}: {
	galaxy: Galaxy
	worldX: number
	worldY: number
	/** Defaults to PICK_RADIUS_WORLD_UNITS (8), sized for this repo's
	 * original galaxy model's own unit scale (radius in the low hundreds).
	 * A host galaxy at a very different scale (e.g. the ported density-wave
	 * renderer's tens-of-thousands-unit radius) should pass its own
	 * scale-appropriate radius instead. */
	pickRadius?: number
}): number {
	let bestIndex = -1
	let bestDist2 = pickRadius * pickRadius
	for (let i = 0; i < galaxy.numSystems; i++) {
		const dx = galaxy.r_xy[2 * i]! - worldX
		const dy = galaxy.r_xy[2 * i + 1]! - worldY
		const dist2 = dx * dx + dy * dy
		if (dist2 < bestDist2) {
			bestDist2 = dist2
			bestIndex = i
		}
	}
	return bestIndex
}
