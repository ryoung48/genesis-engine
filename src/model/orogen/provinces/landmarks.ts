/**
 * Landmass / water body labeling via connected-component BFS.
 * Each region gets a landmark ID; each landmark has a type and size.
 * O(N) time, typed arrays only.
 */
import type { SphereMesh } from "../types"

export type LandmarkType = "continent" | "island" | "isle" | "ocean" | "sea" | "lake"

export interface OrogenLandmarks {
	/** Per-region landmark index */
	regionLandmark: Int32Array
	/** Per-landmark type code (index into LANDMARK_TYPES) */
	type: Uint8Array
	/** Per-landmark region count */
	size: Int32Array
	/** Total number of landmarks */
	count: number
}

export const LANDMARK_TYPES: LandmarkType[] = [
	"continent", // 0
	"island",    // 1
	"isle",      // 2
	"ocean",     // 3
	"sea",       // 4
	"lake",      // 5
]

const TYPE_CONTINENT = 0
const TYPE_ISLAND = 1
const TYPE_ISLE = 2
const TYPE_OCEAN = 3
const TYPE_SEA = 4
const TYPE_LAKE = 5

export function computeLandmarks(
	mesh: SphereMesh,
	isLand: Uint8Array,
): OrogenLandmarks {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh

	const regionLandmark = new Int32Array(N).fill(-1)
	const sizes: number[] = []
	const isWater: boolean[] = []
	const queue: number[] = []
	let landmarkId = 0

	for (let r = 0; r < N; r++) {
		if (regionLandmark[r] >= 0) continue

		const water = !isLand[r]
		isWater.push(water)
		let size = 0

		queue.length = 0
		queue.push(r)
		regionLandmark[r] = landmarkId
		let head = 0

		while (head < queue.length) {
			const curr = queue[head++]
			size++
			for (let j = adjOffset[curr], jEnd = adjOffset[curr + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (regionLandmark[nb] >= 0) continue
				if (water !== !isLand[nb]) continue
				regionLandmark[nb] = landmarkId
				queue.push(nb)
			}
		}

		sizes.push(size)
		landmarkId++
	}

	const count = landmarkId

	// Classify by size relative to total
	const type = new Uint8Array(count)
	for (let i = 0; i < count; i++) {
		const ratio = sizes[i] / N
		if (isWater[i]) {
			if (ratio >= 0.01) type[i] = TYPE_OCEAN
			else if (ratio >= 0.001) type[i] = TYPE_SEA
			else type[i] = TYPE_LAKE
		} else {
			if (ratio >= 0.01) type[i] = TYPE_CONTINENT
			else if (ratio >= 0.001) type[i] = TYPE_ISLAND
			else type[i] = TYPE_ISLE
		}
	}

	return {
		regionLandmark,
		type,
		size: new Int32Array(sizes),
		count,
	}
}
