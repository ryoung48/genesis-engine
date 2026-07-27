import type { GenesisPartition } from "@/model"
import type { ComputeHeritagesParams } from "@/model/society/heritage/types"
import { SHARED } from "@/model/society/shared"

function computeHeritages({
	cultures,
	seed,
}: ComputeHeritagesParams): GenesisPartition {
	const active = new Uint8Array(cultures.count)
	let activeCount = 0
	for (let i = 0; i < cultures.count; i++) {
		if (cultures.size[i] > 0) {
			active[i] = 1
			activeCount++
		}
	}
	return SHARED.computeGraphPartition({
		nodeCount: cultures.count,
		adjOffset: cultures.adjOffset,
		adjList: cultures.adjList,
		active,
		targetCount: Math.max(1, Math.floor(activeCount / 4)),
		seed: seed + 4102,
	})
}

export const HERITAGE = {
	computeHeritages,
}
