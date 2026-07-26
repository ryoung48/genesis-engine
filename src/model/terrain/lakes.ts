import type { GenesisRainfall, SphereMesh } from ".."
import { MinHeap } from "../shared"
import type {
	SelectCompactLakeFallbackParams,
	TrimLakeCorridorsParams,
	SelectConnectedLakeCellsParams,
	ComputeLakesParams,
} from "./types"

function computeSubgraphNeighborCount(
	numRegions: number,
	adjOffset: Int32Array,
	adjList: Int32Array,
	cells: number[],
): Uint8Array {
	const inSubgraph = new Uint8Array(numRegions)
	const neighborCount = new Uint8Array(numRegions)
	for (const cell of cells) inSubgraph[cell] = 1
	for (const cell of cells) {
		let count = 0
		for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
			if (inSubgraph[adjList[j]]) count++
		}
		neighborCount[cell] = count
	}
	return neighborCount
}

function computeLakeSurface(
	lakeCells: number[],
	elevation: Float32Array,
): number {
	let lakeSurface = elevation[lakeCells[0]]
	for (const cell of lakeCells) {
		lakeSurface = Math.max(lakeSurface, elevation[cell])
	}
	return lakeSurface + 1e-7
}

function estimateSubgraphDiameter(
	numRegions: number,
	adjOffset: Int32Array,
	adjList: Int32Array,
	cells: number[],
): number {
	if (cells.length <= 1) return 0

	const inSubgraph = new Uint8Array(numRegions)
	const distance = new Int32Array(numRegions)
	const queue = new Int32Array(cells.length)
	for (const cell of cells) inSubgraph[cell] = 1

	const bfs = (start: number) => {
		distance.fill(-1)
		let head = 0
		let tail = 0
		queue[tail++] = start
		distance[start] = 0
		let farthest = start

		while (head < tail) {
			const cell = queue[head++]
			if (distance[cell] > distance[farthest]) farthest = cell
			for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
				const nb = adjList[j]
				if (!inSubgraph[nb] || distance[nb] >= 0) continue
				distance[nb] = distance[cell] + 1
				queue[tail++] = nb
			}
		}

		return { farthest, distance: distance[farthest] }
	}

	const first = bfs(cells[0])
	return bfs(first.farthest).distance
}

function selectCompactLakeFallback({
	numRegions,
	adjOffset,
	adjList,
	elevation,
	lakeCells,
	targetCellCount,
}: SelectCompactLakeFallbackParams): number[] {
	if (lakeCells.length === 0 || targetCellCount <= 0) return []

	const allowed = new Uint8Array(numRegions)
	const queued = new Uint8Array(numRegions)
	const selected = new Uint8Array(numRegions)
	const frontierKey = new Float32Array(numRegions)
	frontierKey.fill(Number.POSITIVE_INFINITY)

	for (const cell of lakeCells) allowed[cell] = 1

	let seed = lakeCells[0]
	for (const cell of lakeCells) {
		if (elevation[cell] < elevation[seed]) seed = cell
	}

	const heap = new MinHeap(frontierKey)
	const compactCells: number[] = [seed]
	selected[seed] = 1

	for (let j = adjOffset[seed]; j < adjOffset[seed + 1]; j++) {
		const nb = adjList[j]
		if (!allowed[nb] || queued[nb]) continue
		queued[nb] = 1
		frontierKey[nb] = elevation[nb]
		heap.push(nb)
	}

	while (heap.size > 0 && compactCells.length < targetCellCount) {
		const cell = heap.pop()
		if (selected[cell]) continue
		selected[cell] = 1
		compactCells.push(cell)

		for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
			const nb = adjList[j]
			if (!allowed[nb] || queued[nb]) continue
			queued[nb] = 1
			frontierKey[nb] = elevation[nb]
			heap.push(nb)
		}
	}

	return compactCells
}

function trimLakeCorridors({
	numRegions,
	adjOffset,
	adjList,
	elevation,
	basinCells,
	lakeCells,
}: TrimLakeCorridorsParams): { lakeCells: number[]; lakeSurface: number } {
	if (lakeCells.length === 0) return { lakeCells: [], lakeSurface: 0 }
	if (lakeCells.length <= 3) {
		return { lakeCells, lakeSurface: computeLakeSurface(lakeCells, elevation) }
	}

	const basinNeighborCount = computeSubgraphNeighborCount(
		numRegions,
		adjOffset,
		adjList,
		basinCells,
	)
	const inLake = new Uint8Array(numRegions)
	const isCorridor = new Uint8Array(numRegions)
	for (const cell of lakeCells) inLake[cell] = 1
	for (const cell of lakeCells) {
		if (basinNeighborCount[cell] <= 2) isCorridor[cell] = 1
	}

	const pruned = new Uint8Array(numRegions)
	const seen = new Uint8Array(numRegions)

	for (const start of lakeCells) {
		if (!isCorridor[start] || seen[start]) continue

		const stack = [start]
		const component: number[] = []
		const attachments = new Set<number>()
		seen[start] = 1

		while (stack.length > 0) {
			const cell = stack.pop()!
			component.push(cell)
			for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
				const nb = adjList[j]
				if (!inLake[nb]) continue
				if (!isCorridor[nb]) {
					attachments.add(nb)
					continue
				}
				if (seen[nb]) continue
				seen[nb] = 1
				stack.push(nb)
			}
		}

		if (component.length >= 3 && attachments.size <= 2) {
			for (const cell of component) pruned[cell] = 1
		}
	}

	const elongatedSeen = new Uint8Array(numRegions)
	for (const start of lakeCells) {
		if (pruned[start] || elongatedSeen[start] || basinNeighborCount[start] > 3)
			continue

		const stack = [start]
		const component: number[] = []
		const attachments = new Set<number>()
		let basinNeighborSum = 0
		elongatedSeen[start] = 1

		while (stack.length > 0) {
			const cell = stack.pop()!
			component.push(cell)
			basinNeighborSum += basinNeighborCount[cell]

			for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
				const nb = adjList[j]
				if (!inLake[nb] || pruned[nb]) continue
				if (basinNeighborCount[nb] > 3) {
					attachments.add(nb)
					continue
				}
				if (elongatedSeen[nb]) continue
				elongatedSeen[nb] = 1
				stack.push(nb)
			}
		}

		if (component.length >= lakeCells.length) continue
		if (component.length < 5 || attachments.size > 2) continue

		const diameter = estimateSubgraphDiameter(
			numRegions,
			adjOffset,
			adjList,
			component,
		)
		const averageBasinNeighbors = basinNeighborSum / component.length
		const widthEstimate = component.length / Math.max(1, diameter + 1)

		if (
			diameter >= 4 &&
			widthEstimate <= 1.6 &&
			averageBasinNeighbors <= 2.75
		) {
			for (const cell of component) pruned[cell] = 1
		}
	}

	const trimmedLakeCells = lakeCells.filter((cell) => !pruned[cell])
	if (trimmedLakeCells.length === lakeCells.length) {
		return { lakeCells, lakeSurface: computeLakeSurface(lakeCells, elevation) }
	}
	if (trimmedLakeCells.length === 0) {
		const fallbackTarget =
			lakeCells.length <= 3 ? lakeCells.length : Math.min(2, lakeCells.length)
		const fallbackLakeCells = selectCompactLakeFallback({
			numRegions,
			adjOffset,
			adjList,
			elevation,
			lakeCells,
			targetCellCount: fallbackTarget,
		})
		return {
			lakeCells: fallbackLakeCells,
			lakeSurface: computeLakeSurface(fallbackLakeCells, elevation),
		}
	}

	return {
		lakeCells: trimmedLakeCells,
		lakeSurface: computeLakeSurface(trimmedLakeCells, elevation),
	}
}

function selectConnectedLakeCells({
	numRegions,
	adjOffset,
	adjList,
	elevation,
	basinCells,
	targetCellCount,
}: SelectConnectedLakeCellsParams): {
	lakeCells: number[]
	lakeSurface: number
} {
	if (basinCells.length === 0 || targetCellCount <= 0) {
		return { lakeCells: [], lakeSurface: 0 }
	}

	const inBasin = new Uint8Array(numRegions)
	const queued = new Uint8Array(numRegions)
	const selected = new Uint8Array(numRegions)
	const frontierKey = new Float32Array(numRegions)
	frontierKey.fill(Number.POSITIVE_INFINITY)

	for (const cell of basinCells) inBasin[cell] = 1
	const basinNeighborCount = computeSubgraphNeighborCount(
		numRegions,
		adjOffset,
		adjList,
		basinCells,
	)

	let seed = basinCells[0]
	for (const cell of basinCells) {
		if (elevation[cell] < elevation[seed]) seed = cell
	}

	const heap = new MinHeap(frontierKey)
	queued[seed] = 1
	frontierKey[seed] = elevation[seed]
	heap.push(seed)

	const lakeCells: number[] = []

	while (heap.size > 0 && lakeCells.length < targetCellCount) {
		const cell = heap.pop()
		if (selected[cell]) continue
		selected[cell] = 1
		lakeCells.push(cell)

		for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
			const nb = adjList[j]
			if (!inBasin[nb] || queued[nb]) continue
			queued[nb] = 1
			const corridorDeficit = Math.max(0, 4 - basinNeighborCount[nb])
			const narrowPenalty = corridorDeficit * corridorDeficit * 0.035
			frontierKey[nb] = elevation[nb] + narrowPenalty
			heap.push(nb)
		}
	}

	return trimLakeCorridors({
		numRegions,
		adjOffset,
		adjList,
		elevation,
		basinCells,
		lakeCells,
	})
}

export function computeLakes({
	mesh,
	elevation,
	rainfall,
	waterLevel,
	basinId,
	isLand,
	emergedLand,
	elevationKm,
}: ComputeLakesParams): void {
	const { numRegions: N, adjOffset, adjList } = mesh
	const lakes = new Uint8Array(N)

	let nextBasin = 0
	for (let r = 0; r < N; r++) {
		if (basinId[r] >= nextBasin) nextBasin = basinId[r] + 1
	}
	if (nextBasin === 0) return

	const basinCells: number[][] = Array.from(
		{ length: nextBasin },
		(): number[] => [],
	)
	const basinRain = new Float32Array(nextBasin)

	for (let r = 0; r < N; r++) {
		const bid = basinId[r]
		if (bid < 0) continue
		basinCells[bid].push(r)
		basinRain[bid] += rainfall.annual[r]
	}

	const EVAP_RATE = 1200 // mm/cell/yr — hot open-water evaporation
	const DESERT_THRESHOLD = 250 // mm/yr — below this, too arid for lakes

	for (let bid = 0; bid < nextBasin; bid++) {
		const allCells = basinCells[bid]
		const inflow = basinRain[bid]
		const avgRain = inflow / allCells.length
		if (avgRain < DESERT_THRESHOLD) {
			for (const cell of allCells) waterLevel[cell] = elevation[cell]
			continue
		}
		const targetCellCount = Math.ceil(inflow / EVAP_RATE)
		const { lakeCells, lakeSurface } = selectConnectedLakeCells({
			numRegions: N,
			adjOffset,
			adjList,
			elevation,
			basinCells: allCells,
			targetCellCount,
		})
		for (const c of lakeCells) {
			lakes[c] = 1
			waterLevel[c] = lakeSurface
		}
		for (const cell of allCells) {
			if (!lakes[cell]) waterLevel[cell] = elevation[cell]
		}
	}
	for (let r = 0; r < N; r++) {
		if (!lakes[r]) continue
		if (emergedLand?.[r] && elevationKm?.[r] != null && elevationKm[r] > 0)
			continue
		isLand[r] = 0
	}
}
