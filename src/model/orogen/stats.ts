import type { SphereMesh } from "./types"

export function countContinents(mesh: SphereMesh, isLand: Uint8Array): number {
	const { numRegions, adjOffset, adjList } = mesh
	let totalLand = 0
	for (let r = 0; r < numRegions; r++) {
		if (isLand[r]) totalLand++
	}
	if (totalLand === 0) return 0

	const minCells = Math.max(
		Math.ceil(numRegions * 0.01),
		Math.ceil(totalLand * 0.05),
	)
	const visited = new Uint8Array(numRegions)
	let count = 0

	for (let start = 0; start < numRegions; start++) {
		if (visited[start] || !isLand[start]) continue
		const queue = [start]
		visited[start] = 1
		let size = 0
		for (let i = 0; i < queue.length; i++) {
			const r = queue[i]
			size++
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!visited[nb] && isLand[nb]) {
					visited[nb] = 1
					queue.push(nb)
				}
			}
		}
		if (size >= minCells) count++
	}

	return count
}
