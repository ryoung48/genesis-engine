import type {
	ComputeEdgeCostParams,
	ComputeWaterDepthParams,
	PairKeyParams,
	PathfindGraph,
	PathfindParams,
	PathfindResult,
	SearchWorkspace,
} from "@/model/pathfinding/types"
import { MinHeap, regionDistanceKm } from "@/model/shared"

const LAND_SPEED_KM_PER_DAY = 30

const SEA_SPEED_KM_PER_DAY = 100

const TOPOGRAPHY_SPEED = [1.0, 0.6, 0.8, 0.2, 0.6, 0, 0] as const

const VEGETATION_SPEED = [0, 0.67, 0.83, 1.0, 0.91, 0.77, 0.56] as const

const EXISTING_ROUTE_SPEED_BONUS = 2.0

const COASTAL_SPEED_MULT = 0.5

const NEAR_COAST_SPEED_MULT = 0.8

function createWorkspace(size: number): SearchWorkspace {
	const distance = new Float32Array(size)
	distance.fill(Infinity)
	return {
		distance,
		prev: new Int32Array(size).fill(-1),
		queued: new Int32Array(size).fill(0),
		settled: new Int32Array(size).fill(0),
		heap: new MinHeap(distance),
	}
}

function computeWaterDepth({
	numRegions,
	adjOffset,
	adjList,
	regionIsLand,
}: ComputeWaterDepthParams): Int32Array {
	const depth = new Int32Array(numRegions).fill(-1)
	const queue = new Int32Array(numRegions)
	let head = 0
	let tail = 0

	for (let r = 0; r < numRegions; r++) {
		if (regionIsLand && regionIsLand[r]) continue
		for (let i = adjOffset[r], end = adjOffset[r + 1]; i < end; i++) {
			const nb = adjList[i]
			if (!regionIsLand || !regionIsLand[nb]) continue
			depth[r] = 1
			queue[tail++] = r
			break
		}
	}

	while (head < tail) {
		const cur = queue[head++]
		const nextDepth = depth[cur] + 1
		for (let i = adjOffset[cur], end = adjOffset[cur + 1]; i < end; i++) {
			const nb = adjList[i]
			if ((regionIsLand && regionIsLand[nb]) || depth[nb] >= 0) continue
			depth[nb] = nextDepth
			queue[tail++] = nb
		}
	}

	return depth
}

function pairKey({ a, b, span }: PairKeyParams): number {
	const from = Math.min(a, b)
	const to = Math.max(a, b)
	return from * span + to
}

function computeEdgeCost({
	graph,
	from,
	to,
	allowLand,
	allowSea,
}: ComputeEdgeCostParams): { cost: number; isLand: boolean } {
	const distKm = regionDistanceKm(graph.r_xyz, from, to, graph.planetRadiusKm)
	const fromLand = !graph.regionIsLand || !!graph.regionIsLand[from]
	const toLand = !graph.regionIsLand || !!graph.regionIsLand[to]
	const isLandEdge = fromLand && toLand
	const isSeaEdge = !fromLand && !toLand

	if (isLandEdge) {
		if (!allowLand) return { cost: Infinity, isLand: true }

		// Combined speed multiplier from topography and vegetation
		let speedMult = 1.0

		if (graph.topography) {
			const tFrom = graph.topography[from] ?? 0
			const tTo = graph.topography[to] ?? 0
			const topoFrom =
				tFrom < TOPOGRAPHY_SPEED.length ? TOPOGRAPHY_SPEED[tFrom] : 1.0
			const topoTo = tTo < TOPOGRAPHY_SPEED.length ? TOPOGRAPHY_SPEED[tTo] : 1.0
			// If either endpoint is impassable (ocean/lake), block
			if (topoFrom === 0 || topoTo === 0)
				return { cost: Infinity, isLand: true }
			speedMult *= (topoFrom + topoTo) / 2
		}

		if (graph.vegetation) {
			const vFrom = graph.vegetation[from] ?? 0
			const vTo = graph.vegetation[to] ?? 0
			const vegFrom =
				vFrom < VEGETATION_SPEED.length ? VEGETATION_SPEED[vFrom] : 1.0
			const vegTo = vTo < VEGETATION_SPEED.length ? VEGETATION_SPEED[vTo] : 1.0
			// If either endpoint is ocean vegetation, block
			if (vegFrom === 0 || vegTo === 0) return { cost: Infinity, isLand: true }
			speedMult *= (vegFrom + vegTo) / 2
		}

		// Existing route bonus (doubles effective speed)
		const key = pairKey({ a: from, b: to, span: graph.numRegions })
		if (graph.routeEdges.has(key)) {
			speedMult *= EXISTING_ROUTE_SPEED_BONUS
		}

		const effectiveSpeed = LAND_SPEED_KM_PER_DAY * speedMult
		return { cost: distKm / effectiveSpeed, isLand: true }
	}

	if (isSeaEdge) {
		if (!allowSea) return { cost: Infinity, isLand: false }

		let speedMult = 1.0

		// Water depth penalty (shallower = slower)
		if (graph.waterDepth) {
			const dFrom = graph.waterDepth[from]
			const dTo = graph.waterDepth[to]
			const fromMult =
				dFrom <= 0
					? 1.0
					: dFrom === 1
						? COASTAL_SPEED_MULT
						: dFrom === 2
							? NEAR_COAST_SPEED_MULT
							: 1.0
			const toMult =
				dTo <= 0
					? 1.0
					: dTo === 1
						? COASTAL_SPEED_MULT
						: dTo === 2
							? NEAR_COAST_SPEED_MULT
							: 1.0
			speedMult *= (fromMult + toMult) / 2
		}

		// Existing sea route bonus
		const key = pairKey({ a: from, b: to, span: graph.numRegions })
		if (graph.routeEdges.has(key)) {
			speedMult *= EXISTING_ROUTE_SPEED_BONUS
		}

		const effectiveSpeed = SEA_SPEED_KM_PER_DAY * speedMult
		return { cost: distKm / effectiveSpeed, isLand: false }
	}

	// Mixed land/sea edge (coastal crossing) - allow but penalize
	if (allowLand && allowSea) {
		const key = pairKey({ a: from, b: to, span: graph.numRegions })
		// Use average of land and sea speeds with penalty
		const mixedSpeed =
			((LAND_SPEED_KM_PER_DAY + SEA_SPEED_KM_PER_DAY) / 2) * 0.67
		if (graph.routeEdges.has(key)) {
			return {
				cost: distKm / (mixedSpeed * EXISTING_ROUTE_SPEED_BONUS),
				isLand: fromLand,
			}
		}
		return { cost: distKm / mixedSpeed, isLand: fromLand }
	}

	return { cost: Infinity, isLand: fromLand }
}

function pathfind({ graph, request }: PathfindParams): PathfindResult {
	if (
		request.startRegion < 0 ||
		request.endRegion < 0 ||
		request.startRegion >= graph.numRegions ||
		request.endRegion >= graph.numRegions
	) {
		return {
			pathRegions: [],
			distanceKm: 0,
			landKm: 0,
			seaKm: 0,
			travelDays: 0,
			reachable: false,
		}
	}

	if (request.startRegion === request.endRegion) {
		return {
			pathRegions: [request.startRegion],
			distanceKm: 0,
			landKm: 0,
			seaKm: 0,
			travelDays: 0,
			reachable: true,
		}
	}

	// Block start/end regions in desolate provinces
	if (graph.desolate && graph.regionProvince) {
		const startProv = graph.regionProvince[request.startRegion]
		const endProv = graph.regionProvince[request.endRegion]
		if (
			(startProv >= 0 && graph.desolate[startProv]) ||
			(endProv >= 0 && graph.desolate[endProv])
		) {
			return {
				pathRegions: [],
				distanceKm: 0,
				landKm: 0,
				seaKm: 0,
				travelDays: 0,
				reachable: false,
			}
		}
	}

	// Compute water depth if needed for sea travel
	const waterDepth =
		request.allowSea && !graph.waterDepth
			? computeWaterDepth({
					numRegions: graph.numRegions,
					adjOffset: graph.adjOffset,
					adjList: graph.adjList,
					regionIsLand: graph.regionIsLand,
				})
			: graph.waterDepth

	const effectiveGraph: PathfindGraph = {
		...graph,
		waterDepth,
	}

	const workspace = createWorkspace(graph.numRegions)
	const { distance, prev, queued, settled, heap } = workspace

	distance[request.startRegion] = 0
	queued[request.startRegion] = 1
	heap.push(request.startRegion)

	while (heap.size > 0) {
		const current = heap.pop()
		if (settled[current]) continue

		// Block travel through desolate provinces
		if (effectiveGraph.desolate && effectiveGraph.regionProvince) {
			const prov = effectiveGraph.regionProvince[current]
			if (prov >= 0 && effectiveGraph.desolate[prov]) continue
		}

		settled[current] = 1
		if (current === request.endRegion) break

		for (
			let i = effectiveGraph.adjOffset[current],
				end = effectiveGraph.adjOffset[current + 1];
			i < end;
			i++
		) {
			const neighbor = effectiveGraph.adjList[i]
			if (settled[neighbor]) continue

			// Block travel through desolate provinces
			if (effectiveGraph.desolate && effectiveGraph.regionProvince) {
				const prov = effectiveGraph.regionProvince[neighbor]
				if (prov >= 0 && effectiveGraph.desolate[prov]) continue
			}

			const { cost } = computeEdgeCost({
				graph: effectiveGraph,
				from: current,
				to: neighbor,
				allowLand: request.allowLand,
				allowSea: request.allowSea,
			})
			if (cost === Infinity) continue

			const nextDistance = distance[current] + cost
			if (!queued[neighbor] || nextDistance < distance[neighbor]) {
				distance[neighbor] = nextDistance
				prev[neighbor] = current
				queued[neighbor] = 1
				heap.push(neighbor)
			}
		}
	}

	// Reconstruct path
	if (!settled[request.endRegion]) {
		return {
			pathRegions: [],
			distanceKm: 0,
			landKm: 0,
			seaKm: 0,
			travelDays: 0,
			reachable: false,
		}
	}

	const path: number[] = []
	for (let r = request.endRegion; r !== request.startRegion; r = prev[r]) {
		path.push(r)
	}
	path.push(request.startRegion)
	path.reverse()

	// Calculate distances and travel time using actual speeds
	let totalKm = 0
	let landKm = 0
	let seaKm = 0
	let totalDays = 0
	for (let i = 1; i < path.length; i++) {
		const from = path[i - 1]
		const to = path[i]
		const dist = regionDistanceKm(graph.r_xyz, from, to, graph.planetRadiusKm)
		totalKm += dist
		const { cost, isLand } = computeEdgeCost({
			graph,
			from,
			to,
			allowLand: request.allowLand,
			allowSea: request.allowSea,
		})
		totalDays += cost
		if (isLand) {
			landKm += dist
		} else {
			seaKm += dist
		}
	}

	return {
		pathRegions: path,
		distanceKm: totalKm,
		landKm,
		seaKm,
		travelDays: Math.ceil(totalDays),
		reachable: true,
	}
}

export const PATHFIND = {
	pathfind,
}
