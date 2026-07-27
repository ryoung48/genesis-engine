import type { ComputeCulturesParams } from "@/model/society/culture/types"
import { GENDER_SYSTEM } from "@/model/society/gender-system"
import { GRAPH_PARTITION } from "@/model/society/graph-partition"
import type { GenesisPartition } from "@/model/society/types"

function computeCultures({
	provinces,
	seed,
	settledMask,
}: ComputeCulturesParams): GenesisPartition {
	const active = new Uint8Array(provinces.count)
	let activeCount = 0
	for (let i = 0; i < provinces.count; i++) {
		if (provinces.desolate[i]) continue
		if (settledMask && !settledMask[i]) continue
		active[i] = 1
		activeCount++
	}
	const partition = GRAPH_PARTITION.computeGraphPartition({
		nodeCount: provinces.count,
		adjOffset: provinces.adjOffset,
		adjList: provinces.adjList,
		active,
		targetCount: Math.max(1, Math.floor(activeCount / 17)),
		seed: seed + 4101,
	})
	return {
		...partition,
		genderSystems: GENDER_SYSTEM.assignCultureGenderSystems({
			count: partition.count,
			seed: seed + 4102,
		}),
	}
}

export const CULTURE = {
	computeCultures,
}
