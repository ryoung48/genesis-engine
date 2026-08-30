import { GRAPH_PARTITION } from "@/model/history/sim/graph-partition"
import type { ComputeHeritagesParams } from "@/model/history/sim/heritage/types"
import type { GenesisPartition } from "@/model/society/types"

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
	return GRAPH_PARTITION.computeGraphPartition({
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
