import type { GenesisPartition } from ".."
import { computeGraphPartition } from "./shared"

export function computeReligions(
	faiths: GenesisPartition,
	seed: number,
): GenesisPartition {
	const active = new Uint8Array(faiths.count)
	let activeCount = 0
	for (let i = 0; i < faiths.count; i++) {
		if (faiths.size[i] > 0) {
			active[i] = 1
			activeCount++
		}
	}
	return computeGraphPartition({
		nodeCount: faiths.count,
		adjOffset: faiths.adjOffset,
		adjList: faiths.adjList,
		active,
		targetCount: Math.max(1, Math.floor(activeCount / 2)),
		seed: seed + 4104,
	})
}
