import { PriorityQueue } from "@datastructures-js/priority-queue"
import { UNITS } from "@/model/shared/units"
import type {
	ComputeOceanDistanceBFSParams,
	ComputeCoastDistancesParams,
	CountContinentsParams,
} from "@/model/shared/stats/types"

const SEA_AREA_THRESHOLD_KM2 = 200_000

function computeOceanDistanceBFS({
	mesh,
	isLand,
	planetRadiusKm,
}: ComputeOceanDistanceBFSParams): Float32Array {
	const { numRegions, adjOffset, adjList, neighborDist } = mesh
	// Full-precision working distances during the algorithm — comparing a
	// dequeued entry's exact candidate against a Float32Array-rounded
	// "current best" (real km distances can be in the thousands, where
	// float32's ~7 significant digits leave a rounding gap bigger than any
	// sane staleness epsilon) causes the entry that should settle a node to
	// be misidentified as stale and dropped, silently orphaning that node
	// and anything only reachable through it. Round to float32 only once, on
	// the final return value.
	const dist = new Float64Array(numRegions).fill(Infinity)
	const settled = new Uint8Array(numRegions)
	const queue = new PriorityQueue<{ region: number; dist: number }>(
		(a, b) => a.dist - b.dist,
	)

	// Label connected water components and measure each one's real area, so
	// seeding isn't gated on a separate module's ratio-based ocean/sea/lake
	// classification (see SEA_AREA_THRESHOLD_KM2 above for why that misfires
	// at Earth scale). A component also counts if it's disconnected from the
	// rest of the world ocean in the mesh graph (e.g. a strait narrower than
	// local mesh resolution) — the Black Sea is still meaningfully "a big
	// body of water" for climate/continentality purposes even if the
	// Bosphorus isn't resolved as a connected channel at this mesh density.
	const meanCellAreaKm2 =
		(4 * Math.PI * planetRadiusKm * planetRadiusKm) / numRegions
	const componentId = new Int32Array(numRegions).fill(-1)
	const componentSizes: number[] = []
	const scratch: number[] = []
	for (let r = 0; r < numRegions; r++) {
		if (isLand[r] || componentId[r] >= 0) continue
		const id = componentSizes.length
		scratch.length = 0
		scratch.push(r)
		componentId[r] = id
		let size = 0
		let head = 0
		while (head < scratch.length) {
			const curr = scratch[head++]
			size++
			for (let j = adjOffset[curr], jEnd = adjOffset[curr + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb] || componentId[nb] >= 0) continue
				componentId[nb] = id
				scratch.push(nb)
			}
		}
		componentSizes.push(size)
	}

	for (let r = 0; r < numRegions; r++) {
		if (isLand[r]) continue
		if (
			componentSizes[componentId[r]] * meanCellAreaKm2 <
			SEA_AREA_THRESHOLD_KM2
		)
			continue
		dist[r] = 0
		queue.enqueue({ region: r, dist: 0 })
	}

	while (!queue.isEmpty()) {
		const next = queue.dequeue()
		if (!next) break
		const { region: r, dist: d } = next
		if (settled[r]) continue
		if (d > dist[r] + 1e-6) continue
		settled[r] = 1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (settled[nb]) continue
			const candidate = d + neighborDist[j] * planetRadiusKm
			if (candidate < dist[nb]) {
				dist[nb] = candidate
				queue.enqueue({ region: nb, dist: candidate })
			}
		}
	}

	// Dijkstra explores every adjacency edge, not just water-to-water ones, so
	// any region reachable at all from a qualifying source — which, on a
	// single connected sphere mesh with the real world ocean present, is
	// every region — gets settled. A leftover Infinity here means the mesh
	// graph is genuinely disconnected or nothing qualified as a source at
	// all (e.g. SEA_AREA_THRESHOLD_KM2 miscalculated and excluded the whole
	// ocean) — a real bug, not an expected "landlocked" case, so surface it
	// instead of quietly inventing a plausible-looking distance.
	const oceanDist = new Float32Array(numRegions)
	let unreachable = 0
	for (let r = 0; r < numRegions; r++) {
		if (Number.isFinite(dist[r])) {
			oceanDist[r] = dist[r]
		} else {
			unreachable++
			oceanDist[r] = 0
		}
	}
	if (unreachable > 0) {
		console.warn(
			`computeOceanDistanceBFS: ${unreachable} region(s) unreachable from any qualifying water source — mesh graph is disconnected or seeding failed; this should not happen for a well-formed planet.`,
		)
	}
	return oceanDist
}

function computeCoastDistances({
	mesh,
	isLand,
	planetRadiusKm = UNITS.defaultPlanetRadiusKm,
}: ComputeCoastDistancesParams): {
	distCoast: Float32Array
	distCoastLand: Float32Array
} {
	const N = mesh.numRegions
	const { adjOffset, adjList, neighborDist } = mesh

	const coastSources: number[] = []
	const landCoastSources: number[] = []
	for (let r = 0; r < N; r++) {
		const r_isLand = isLand[r]
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if (isLand[adjList[j]] !== r_isLand) {
				coastSources.push(r)
				if (r_isLand) landCoastSources.push(r)
				break
			}
		}
	}

	// Full-precision working distances — see computeOceanDistanceBFS for why
	// comparing against a Float32Array-rounded "current best" at real km
	// scale silently drops the entry that should settle a node.
	function dijkstra(sources: number[], restrictToLand: boolean): Float64Array {
		const dist = new Float64Array(N).fill(Infinity)
		const settled = new Uint8Array(N)
		const queue = new PriorityQueue<{ region: number; dist: number }>(
			(a, b) => a.dist - b.dist,
		)
		for (const r of sources) {
			dist[r] = 0
			queue.enqueue({ region: r, dist: 0 })
		}
		while (!queue.isEmpty()) {
			const next = queue.dequeue()
			if (!next) break
			const { region: r, dist: d } = next
			if (settled[r]) continue
			if (d > dist[r] + 1e-6) continue
			settled[r] = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (settled[nb]) continue
				if (restrictToLand && !isLand[nb]) continue
				const candidate = d + neighborDist[j] * planetRadiusKm
				if (candidate < dist[nb]) {
					dist[nb] = candidate
					queue.enqueue({ region: nb, dist: candidate })
				}
			}
		}
		return dist
	}

	const coastDistWorking = dijkstra(coastSources, false)
	const landCoastDistWorking = dijkstra(landCoastSources, true)

	const distCoast = new Float32Array(N)
	const distCoastLand = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		distCoast[r] = Number.isFinite(coastDistWorking[r])
			? coastDistWorking[r]
			: 0
		distCoastLand[r] = landCoastDistWorking[r] // Infinity for water cells, by design
	}

	let unreachable = 0
	for (let r = 0; r < N; r++) {
		if (!Number.isFinite(coastDistWorking[r])) unreachable++
	}
	if (unreachable > 0) {
		console.warn(
			`computeCoastDistances: ${unreachable} region(s) unreachable from any coastline — mesh graph is disconnected; this should not happen for a well-formed planet.`,
		)
	}

	return { distCoast, distCoastLand }
}

function countContinents({ mesh, isLand }: CountContinentsParams): number {
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

export const STATS = {
	computeOceanDistanceBFS,
	computeCoastDistances,
	countContinents,
}
