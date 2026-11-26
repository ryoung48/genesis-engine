import { ENDORHEIC } from "@/model/geography/terrain/endorheic"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import type {
	ComputeLakeSurfaceParams,
	ComputeLakesParams,
	ComputeSubgraphNeighborCountParams,
	EstimateSubgraphDiameterParams,
	LakeKind,
	SelectCompactLakeFallbackParams,
	SelectConnectedLakeCellsParams,
	TrimLakeCorridorsParams,
} from "@/model/geography/terrain/lakes/types"
import { MinHeap } from "@/model/shared/min-heap"

function computeSubgraphNeighborCount({
	numRegions,
	adjOffset,
	adjList,
	cells,
}: ComputeSubgraphNeighborCountParams): Uint8Array {
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

function computeLakeSurface({
	lakeCells,
	elevation,
}: ComputeLakeSurfaceParams): number {
	let lakeSurface = elevation[lakeCells[0]]
	for (const cell of lakeCells) {
		lakeSurface = Math.max(lakeSurface, elevation[cell])
	}
	return lakeSurface + 1e-7
}

function estimateSubgraphDiameter({
	numRegions,
	adjOffset,
	adjList,
	cells,
}: EstimateSubgraphDiameterParams): number {
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
	lakeCells,
}: TrimLakeCorridorsParams): { lakeCells: number[]; lakeSurface: number } {
	if (lakeCells.length === 0) return { lakeCells: [], lakeSurface: 0 }
	if (lakeCells.length <= 3) {
		return {
			lakeCells,
			lakeSurface: computeLakeSurface({ lakeCells, elevation }),
		}
	}

	const lakeNeighborCount = computeSubgraphNeighborCount({
		numRegions,
		adjOffset,
		adjList,
		cells: lakeCells,
	})
	const inLake = new Uint8Array(numRegions)
	const isCorridor = new Uint8Array(numRegions)
	for (const cell of lakeCells) inLake[cell] = 1
	for (const cell of lakeCells) {
		if (lakeNeighborCount[cell] <= 2) isCorridor[cell] = 1
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
		if (pruned[start] || elongatedSeen[start] || lakeNeighborCount[start] > 3)
			continue

		const stack = [start]
		const component: number[] = []
		const attachments = new Set<number>()
		let lakeNeighborSum = 0
		elongatedSeen[start] = 1

		while (stack.length > 0) {
			const cell = stack.pop()!
			component.push(cell)
			lakeNeighborSum += lakeNeighborCount[cell]

			for (let j = adjOffset[cell]; j < adjOffset[cell + 1]; j++) {
				const nb = adjList[j]
				if (!inLake[nb] || pruned[nb]) continue
				if (lakeNeighborCount[nb] > 3) {
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

		const diameter = estimateSubgraphDiameter({
			numRegions,
			adjOffset,
			adjList,
			cells: component,
		})
		const averageLakeNeighbors = lakeNeighborSum / component.length
		const widthEstimate = component.length / Math.max(1, diameter + 1)

		if (diameter >= 4 && widthEstimate <= 1.6 && averageLakeNeighbors <= 2.75) {
			for (const cell of component) pruned[cell] = 1
		}
	}

	const trimmedLakeCells = lakeCells.filter((cell) => !pruned[cell])
	if (trimmedLakeCells.length === lakeCells.length) {
		return {
			lakeCells,
			lakeSurface: computeLakeSurface({ lakeCells, elevation }),
		}
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
			lakeSurface: computeLakeSurface({
				lakeCells: fallbackLakeCells,
				elevation,
			}),
		}
	}

	return {
		lakeCells: trimmedLakeCells,
		lakeSurface: computeLakeSurface({ lakeCells: trimmedLakeCells, elevation }),
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
	const basinNeighborCount = computeSubgraphNeighborCount({
		numRegions,
		adjOffset,
		adjList,
		cells: basinCells,
	})

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
		lakeCells,
	})
}

const lakeKinds: readonly LakeKind[] = [
	"none",
	"fresh",
	"salt",
	"pan",
	"brackish",
]

const lakeKindCode: Record<LakeKind, number> = {
	none: 0,
	fresh: 1,
	salt: 2,
	pan: 3,
	brackish: 4,
}

function computeLakes({
	mesh,
	planetRadiusKm,
	secondsPerYear,
	elevation,
	rainfall,
	petMonthly,
	waterLevel,
	basinId,
	basinTerminal,
	basinInflow,
	basinEvaporation,
	lakeKind,
	isLand,
	emergedLand,
	elevationKm,
}: ComputeLakesParams): void {
	const { numRegions: N, adjOffset, adjList } = mesh
	const lakes = new Uint8Array(N)
	const waterKind = new Uint8Array(N)

	const layout = ENDORHEIC.layout({ basinId, elevation })
	const nextBasin = layout.cells.length
	if (nextBasin === 0) return

	const basinCells = layout.cells
	const basinRain = new Float32Array(nextBasin)
	for (let bid = 0; bid < nextBasin; bid++)
		for (const r of basinCells[bid]) basinRain[bid] += rainfall.annual[r]

	const areaM2 = new Float64Array(N)
	const r2 = planetRadiusKm * planetRadiusKm * 1e6
	for (let r = 0; r < N; r++) areaM2[r] = mesh.regionArea[r] * r2
	const sill = new Float32Array(nextBasin)
	for (let bid = 0; bid < nextBasin; bid++)
		sill[bid] = waterLevel[layout.lowest[bid]]
	const bodies = ENDORHEIC.waterBodies({
		mesh,
		elevation,
		layout,
		terminal: basinTerminal,
		inflowM3s: basinInflow,
		sill,
		deficitMm: ENDORHEIC.evaporationDeficit({
			petMonthly,
			rainfallAnnual: rainfall.annual,
			numRegions: N,
		}),
		areaM2,
		secondsPerYear,
		floorFraction: GROUNDWATER_CONFIG.panFloorFraction,
	})

	const EVAP_RATE = 1200 // mm/cell/yr — hot open-water evaporation
	const DESERT_THRESHOLD = 250 // mm/yr — below this, too arid for lakes

	for (let bid = 0; bid < nextBasin; bid++) {
		const allCells = basinCells[bid]
		if (basinTerminal[bid]) {
			const { lake, pan } = bodies[bid]
			const panCells = [...pan]
			for (const cell of allCells) waterLevel[cell] = elevation[cell]
			if (lake.length > 0) {
				const { lakeCells, lakeSurface } = trimLakeCorridors({
					numRegions: N,
					adjOffset,
					adjList,
					elevation,
					lakeCells: lake,
				})
				const retained = new Set(lakeCells)
				for (const c of lake) {
					if (!retained.has(c)) {
						panCells.push(c)
						continue
					}
					lakes[c] = 1
					waterKind[c] = lakeKindCode.salt
					waterLevel[c] = lakeSurface
				}
			}
			for (const c of panCells) isLand[c] = 1
			const { lakeCells: trimmedPan } = trimLakeCorridors({
				numRegions: N,
				adjOffset,
				adjList,
				elevation,
				lakeCells: panCells,
			})
			for (const c of trimmedPan) {
				lakeKind[c] = lakeKindCode.pan
			}
			continue
		}
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
		const openKind = ENDORHEIC.openLakeKind({
			inflowM3s: basinInflow[bid],
			evaporationM3s: basinEvaporation[bid],
		})
		for (const c of lakeCells) {
			lakes[c] = 1
			waterKind[c] = lakeKindCode[openKind]
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
		lakeKind[r] = waterKind[r]
	}
}

export const LAKES = {
	computeLakes,
	kinds: lakeKinds,
	kindCode: lakeKindCode,
}
