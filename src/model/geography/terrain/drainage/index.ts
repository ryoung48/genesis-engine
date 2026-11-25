import type {
	DrainageOrder,
	DrainageOrderParams,
} from "@/model/geography/terrain/drainage/types"
import { MinHeap } from "@/model/shared/min-heap"

function order({
	mesh,
	elevation,
	isLand,
	sinks,
}: DrainageOrderParams): DrainageOrder {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const drainTarget = new Int32Array(N).fill(-1)
	const visited = new Uint8Array(N)
	const processOrder: number[] = []
	const waterLevel = new Float32Array(N)

	const key = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		let h = (r * 2654435761) >>> 0
		h = (((h >>> 16) ^ h) * 0x45d9f3b) >>> 0
		h = ((h >>> 16) ^ h) >>> 0
		key[r] = elevation[r] + (h / 0xffffffff) * 1e-7
	}
	const heap = new MinHeap(key)

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) visited[r] = 1
	}

	for (let r = 0; r < N; r++) {
		if (visited[r]) continue
		let touchesWater = false
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			if (!isLand[adjList[j]]) {
				touchesWater = true
				drainTarget[r] = adjList[j]
				break
			}
		}
		if (!touchesWater && !sinks[r]) continue
		visited[r] = 1
		waterLevel[r] = elevation[r]
		heap.push(r)
		processOrder.push(r)
	}

	while (heap.size > 0) {
		const r = heap.pop()
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			const nb = adjList[j]
			if (visited[nb]) continue
			visited[nb] = 1
			drainTarget[nb] = r
			waterLevel[nb] = Math.max(waterLevel[r], elevation[nb])
			heap.push(nb)
			processOrder.push(nb)
		}
	}

	return {
		drainTarget,
		processOrder: Int32Array.from(processOrder),
		waterLevel,
	}
}

export const DRAINAGE = { order }
