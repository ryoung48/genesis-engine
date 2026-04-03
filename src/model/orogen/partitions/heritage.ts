import type { OrogenPartition } from "../types"
import { computeGraphPartition } from "./shared"

export function computeHeritages(
	cultures: OrogenPartition,
	seed: number,
): OrogenPartition {
	const active = new Uint8Array(cultures.count)
	let activeCount = 0
	for (let i = 0; i < cultures.count; i++) {
		if (cultures.size[i] > 0) {
			active[i] = 1
			activeCount++
		}
	}
	return computeGraphPartition({
		nodeCount: cultures.count,
		adjOffset: cultures.adjOffset,
		adjList: cultures.adjList,
		active,
		targetCount: Math.max(1, Math.floor(activeCount / 6)),
		seed: seed + 4102,
	})
}
