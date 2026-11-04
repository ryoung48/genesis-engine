import type { StraitDampingParams } from "@/model/climate/ocean/tides/tidal-map/straits/types"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { PriorityHeap } from "@/model/shared/min-heap"

const OPEN_RATIO = 0.5
const MIN_FACTOR = 0.1
const OPEN_HALF_WIDTH_KM = 450

function damping({
	mesh,
	isOcean,
	landmarks,
	planetRadiusKm,
}: StraitDampingParams): Float32Array {
	const { numRegions: N, adjOffset, adjList, neighborDist } = mesh
	const edgeKm = (j: number) => (neighborDist[j] ?? 0) * planetRadiusKm

	const width = new Float64Array(N).fill(Infinity)
	const near = new PriorityHeap<number>()
	for (let r = 0; r < N; r++)
		if (!isOcean(r)) {
			width[r] = 0
			near.push(0, r)
		}
	for (let top = near.pop(); top; top = near.pop()) {
		const { key, value: r } = top
		if (key > width[r]) continue
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			const nb = adjList[j]
			const next = key + edgeKm(j)
			if (next < width[nb]) {
				width[nb] = next
				near.push(next, nb)
			}
		}
	}

	const seeds = new Map<number, number>()
	for (let r = 0; r < N; r++) {
		if (!isOcean(r)) continue
		const id = landmarks.regionLandmark[r]
		if (id < 0 || landmarks.type[id] !== LANDMARKS.landmarkTypeOcean) continue
		const best = seeds.get(id)
		if (best === undefined || width[r] > width[best]) seeds.set(id, r)
	}
	const bottleneck = new Float64Array(N)
	const wide = new PriorityHeap<number>()
	for (const seed of seeds.values()) {
		bottleneck[seed] = width[seed]
		wide.push(-width[seed], seed)
	}
	for (let top = wide.pop(); top; top = wide.pop()) {
		const r = top.value
		if (-top.key < bottleneck[r]) continue
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			const nb = adjList[j]
			if (!isOcean(nb)) continue
			const next = Math.min(bottleneck[r], width[nb])
			if (next > bottleneck[nb]) {
				bottleneck[nb] = next
				wide.push(-next, nb)
			}
		}
	}

	const peak = new Int32Array(N).fill(-1)
	const climb = (start: number) => {
		const path: number[] = []
		let r = start
		while (peak[r] < 0) {
			path.push(r)
			let up = r
			for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
				const nb = adjList[j]
				if (
					isOcean(nb) &&
					(width[nb] > width[up] || (width[nb] === width[up] && nb < up))
				)
					up = nb
			}
			if (up === r) {
				peak[r] = r
				break
			}
			r = up
		}
		const top = peak[r]
		for (const cell of path) peak[cell] = top
		return top
	}

	const factor = new Float32Array(N).fill(1)
	for (let r = 0; r < N; r++) {
		if (!isOcean(r)) continue
		const top = climb(r)
		const ratio =
			Number.isFinite(width[top]) &&
			width[top] > 0 &&
			bottleneck[top] < OPEN_HALF_WIDTH_KM
				? bottleneck[top] / width[top]
				: 1
		factor[r] = Math.max(MIN_FACTOR, Math.min(1, (ratio / OPEN_RATIO) ** 2))
	}
	return factor
}

export const TIDAL_STRAITS = { damping }
