import type { SphereMesh } from ".."

export function computeOceanDistanceBFS(
	mesh: SphereMesh,
	isLand: Uint8Array,
	avgEdgeKm: number,
): Float32Array {
	const { numRegions, adjOffset, adjList } = mesh
	const oceanDist = new Float32Array(numRegions)
	const visited = new Uint8Array(numRegions)
	const queue: number[] = []
	const hops = new Int32Array(numRegions)

	for (let r = 0; r < numRegions; r++) {
		if (!isLand[r]) {
			visited[r] = 1
			queue.push(r)
		}
	}

	let head = 0
	while (head < queue.length) {
		const r = queue[head++]
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!visited[nb]) {
				visited[nb] = 1
				hops[nb] = hops[r] + 1
				oceanDist[nb] = hops[nb] * avgEdgeKm
				queue.push(nb)
			}
		}
	}

	return oceanDist
}

/**
 * BFS coast-distance fields from an isLand mask.
 * distCoast: hop count from nearest coast boundary (land or ocean side).
 * distCoastLand: hop count from nearest coast, land cells only.
 */
export function computeCoastDistances(
	mesh: SphereMesh,
	isLand: Uint8Array,
): { distCoast: Float32Array; distCoastLand: Float32Array } {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const distCoast = new Float32Array(N).fill(Infinity)
	const distCoastLand = new Float32Array(N).fill(Infinity)

	const coastQueue: number[] = []
	const landQueue: number[] = []
	for (let r = 0; r < N; r++) {
		const r_isLand = isLand[r]
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if (isLand[adjList[j]] !== r_isLand) {
				distCoast[r] = 0
				coastQueue.push(r)
				if (r_isLand) {
					distCoastLand[r] = 0
					landQueue.push(r)
				}
				break
			}
		}
	}

	let head = 0
	while (head < coastQueue.length) {
		const r = coastQueue[head++]
		const d = distCoast[r] + 1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (d < distCoast[nb]) {
				distCoast[nb] = d
				coastQueue.push(nb)
			}
		}
	}

	head = 0
	while (head < landQueue.length) {
		const r = landQueue[head++]
		const d = distCoastLand[r] + 1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (d < distCoastLand[nb] && isLand[nb]) {
				distCoastLand[nb] = d
				landQueue.push(nb)
			}
		}
	}

	return { distCoast, distCoastLand }
}

export function countContinents(mesh: SphereMesh, isLand: Uint8Array): number {
	const { numRegions, adjOffset, adjList } = mesh
	let totalLand = 0
	for (let r = 0; r < numRegions; r++) {
		if (isLand[r]) totalLand++
	}
	if (totalLand === 0) return 0

	// A land mass counts as a continent when it contains at least 5% of all
	// land cells. This scales naturally with planet land coverage and avoids
	// classifying every small island chain as its own continent.
	const minCells = Math.ceil(totalLand * 0.05)
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
