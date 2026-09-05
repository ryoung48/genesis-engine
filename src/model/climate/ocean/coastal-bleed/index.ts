import type { CoastalBleedInput } from "@/model/climate/ocean/coastal-bleed/types"
import { MATH } from "@/model/shared/math/core"

function bleedOntoLand({
	mesh,
	isLand,
	isLake,
	oceanValue,
	avgEdgeKm,
}: CoastalBleedInput): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const bleed = new Float32Array(N)
	const landFadeHops = Math.max(4, Math.round(600 / avgEdgeKm))
	const dist = new Int32Array(N).fill(-1)
	const queue = new Int32Array(N)
	let head = 0
	let tail = 0

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let sum = 0
		let count = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && !isLake[nb]) {
				sum += oceanValue[nb]
				count++
			}
		}
		if (count === 0) continue
		bleed[r] = sum / count
		dist[r] = 0
		queue[tail++] = r
	}

	while (head < tail) {
		const r = queue[head++]
		const d = dist[r] + 1
		if (d >= landFadeHops) continue
		const fade = 1 - d / landFadeHops
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] && dist[nb] === -1) {
				dist[nb] = d
				bleed[nb] = bleed[r] * fade
				queue[tail++] = nb
			}
		}
	}

	return bleed
}

function decay(distance: number): number {
	return 1 - MATH.smoothstep({ edge0: 0, edge1: 800, x: distance })
}

export const COASTAL_BLEED = { apply: bleedOntoLand, decay }
