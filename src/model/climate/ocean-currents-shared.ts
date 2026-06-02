import type { SphereMesh } from ".."

export function computeCoastalWarmthFromOceanWarmth(
	mesh: SphereMesh,
	isLand: Uint8Array,
	isLake: Uint8Array,
	oceanWarmth: Float32Array,
	avgEdgeKm: number,
): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const coastalWarmth = new Float32Array(N)
	const landFadeHops = Math.max(4, Math.round(600 / avgEdgeKm))
	const landDist = new Int32Array(N).fill(-1)
	const landQueue = new Int32Array(N)
	let lqLen = 0
	let landHead = 0

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let warmSum = 0
		let oceanCount = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && !isLake[nb]) {
				warmSum += oceanWarmth[nb]
				oceanCount++
			}
		}
		if (oceanCount === 0) continue
		coastalWarmth[r] = warmSum / oceanCount
		landDist[r] = 0
		landQueue[lqLen++] = r
	}

	while (landHead < lqLen) {
		const r = landQueue[landHead++]
		const d = landDist[r] + 1
		if (d >= landFadeHops) continue
		const fade = 1 - d / landFadeHops
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] && landDist[nb] === -1) {
				landDist[nb] = d
				coastalWarmth[nb] = coastalWarmth[r] * fade
				landQueue[lqLen++] = nb
			}
		}
	}

	return coastalWarmth
}
