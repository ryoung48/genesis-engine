import type { OrogenPartition, OrogenProvinces } from ".."
import { assignCultureGenderSystems } from "./gender-system"
import { computeGraphPartition } from "./shared"

export function computeCultures(
	provinces: Pick<
		OrogenProvinces,
		"count" | "desolate" | "adjOffset" | "adjList"
	>,
	seed: number,
	/** When provided, only settled[p]===1 provinces receive cultures */
	settledMask?: Uint8Array,
): OrogenPartition {
	const active = new Uint8Array(provinces.count)
	let activeCount = 0
	for (let i = 0; i < provinces.count; i++) {
		if (provinces.desolate[i]) continue
		if (settledMask && !settledMask[i]) continue
		active[i] = 1
		activeCount++
	}
	const partition = computeGraphPartition({
		nodeCount: provinces.count,
		adjOffset: provinces.adjOffset,
		adjList: provinces.adjList,
		active,
		targetCount: Math.max(1, Math.floor(activeCount / 17)),
		seed: seed + 4101,
	})
	return {
		...partition,
		genderSystems: assignCultureGenderSystems(partition.count, seed + 4102),
	}
}
