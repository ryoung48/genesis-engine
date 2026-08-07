import type { ComputeCulturesParams } from "@/model/society/culture/types"
import { GENDER_SYSTEM } from "@/model/society/gender-system"
import { GRAPH_PARTITION } from "@/model/society/graph-partition"
import { computePartitionBorderBlend } from "@/model/society/partition-blend"
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
	// Border-bleed stripes: a static approximation of the old per-tick
	// culture-spread simulation (removed with the old history sim), computed
	// once here at generation time directly over province adjacency.
	const { blendSecondary, blendWeight } = computePartitionBorderBlend({
		nodeCount: provinces.count,
		adjOffset: provinces.adjOffset,
		adjList: provinces.adjList,
		assignment: partition.assignment,
		partitionSize: partition.size,
		seed: seed + 4103,
	})
	return {
		...partition,
		genderSystems: GENDER_SYSTEM.assignCultureGenderSystems({
			count: partition.count,
			seed: seed + 4102,
		}),
		blendSecondary,
		blendWeight,
	}
}

export const CULTURE = {
	computeCultures,
}
