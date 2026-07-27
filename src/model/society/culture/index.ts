import type { GenesisPartition } from "@/model"
import type { ComputeCulturesParams } from "@/model/society/culture/types"
import { GENDER_SYSTEM } from "@/model/society/gender-system"
import { SHARED } from "@/model/society/shared"

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
	const partition = SHARED.computeGraphPartition({
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
