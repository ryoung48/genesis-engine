import type { OrogenPartition, OrogenProvinces } from "../types"
import { computeGraphPartition } from "./shared"

export function computeCultures(
	provinces: Pick<OrogenProvinces, "count" | "desolate" | "adjOffset" | "adjList">,
	seed: number,
): OrogenPartition {
	const active = new Uint8Array(provinces.count)
	let activeCount = 0
	for (let i = 0; i < provinces.count; i++) {
		if (!provinces.desolate[i]) {
			active[i] = 1
			activeCount++
		}
	}
	return computeGraphPartition({
		nodeCount: provinces.count,
		adjOffset: provinces.adjOffset,
		adjList: provinces.adjList,
		active,
		targetCount: Math.max(1, Math.floor(activeCount / 8)),
		seed: seed + 4101,
	})
}
