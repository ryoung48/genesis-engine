import { PriorityHeap } from "@/model/shared/min-heap"
import type { SpreadParams } from "@/model/shared/spread/types"

function km({
	mesh,
	radiusKm,
	dist,
	maxKm,
	canEnter,
	onReach,
}: SpreadParams): void {
	const { adjOffset, adjList, r_xyz } = mesh
	const heap = new PriorityHeap<number>()
	for (let c = 0; c < dist.length; c++)
		if (dist[c] < Infinity) heap.push(dist[c], c)
	for (let top = heap.pop(); top; top = heap.pop()) {
		const c = top.value
		if (top.key > dist[c]) continue
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (!canEnter({ from: c, to: nb })) continue
			const dot =
				r_xyz[3 * c] * r_xyz[3 * nb] +
				r_xyz[3 * c + 1] * r_xyz[3 * nb + 1] +
				r_xyz[3 * c + 2] * r_xyz[3 * nb + 2]
			const nd = top.key + Math.acos(Math.max(-1, Math.min(1, dot))) * radiusKm
			if (nd < dist[nb] && nd <= maxKm) {
				dist[nb] = nd
				onReach({ from: c, to: nb })
				heap.push(nd, nb)
			}
		}
	}
}

export const SPREAD = { km }
