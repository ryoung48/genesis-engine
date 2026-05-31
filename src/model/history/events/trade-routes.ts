import { MinHeap } from "../../shared/min-heap"
import { regionDistanceKm, regionPathLengthKm } from "../../shared/units"
import { buildUrquhartEdgesFromFlat } from "../../shared/urquhart"
import {
	ROUTE_LAND_MAJOR,
	ROUTE_LAND_MINOR,
	ROUTE_SEA,
	type Route,
	type RouteEdge,
	type SerializedRouteKind,
} from "../../transport/worker-types"
import { PROV } from "../fields"
import type { HistoryState } from "../state"

const ROUTE_TUNING = {
	land: {
		minBodyShare: 0.001,
		majorSettlementMin: 10_000,
		minorSettlementMin: 1_000,
		majorMaxLengthKm: 3_000,
		minorMaxLengthKm: 1_000,
		newEdgeCost: 1,
		existingEdgeCost: 0.25,
	},
	sea: {
		portSettlementMin: 1_000,
		maxLengthKm: 5_000,
		shortRouteMaxLengthKm: 2_500,
		shortRouteMaxPop: 5_000,
		minBodyShare: 0.001,
		coastalPenalty: 10,
		nearCoastPenalty: 1,
		newEdgeCost: 1,
		existingEdgeCost: 0.25,
	},
} as const

export const SEA_ROUTE_PORT_MIN_POPULATION = ROUTE_TUNING.sea.portSettlementMin

interface RouteInputs {
	planetRadiusKm?: number
	settlementRegions?: Int32Array
	settlementWaterLandmarks?: Int32Array
	settlementPortRegions?: Int32Array
	timings?: Array<{ Stage: string; ms: string }>
}

interface RouteComputation {
	routes: Route[]
	network: RouteEdge[]
}

function timed<T>(
	label: string,
	timings: Array<{ Stage: string; ms: string }> | undefined,
	fn: () => T,
): T {
	const t0 = performance.now()
	const result = fn()
	if (timings) {
		timings.push({ Stage: label, ms: (performance.now() - t0).toFixed(1) })
	}
	return result
}

interface RouteCandidate {
	province: number
	region: number
}

interface LandCandidateGroup {
	cluster: number
	landmark: number
	candidates: RouteCandidate[]
}

interface LandCandidateGroupsByKind {
	major: LandCandidateGroup[]
	minor: LandCandidateGroup[]
}

interface SeaCandidateGroup {
	waterLandmark: number
	candidates: Array<{
		province: number
		anchorRegion: number
		portRegion: number
	}>
}

interface SearchWorkspace {
	distance: Float32Array
	prev: Int32Array
	queued: Int32Array
	settled: Int32Array
	targetStamp: Int32Array
	targetCount: Int32Array
	heap: MinHeap
	stamp: number
}

interface SeaNeighborWorkspace {
	distance: Float32Array
	owner: Int32Array
	queued: Int32Array
	settled: Int32Array
	heap: MinHeap
	stamp: number
}

function pairKey(a: number, b: number, span: number): number {
	const from = Math.min(a, b)
	const to = Math.max(a, b)
	return from * span + to
}

function edgeKey(
	a: number,
	b: number,
	kind: SerializedRouteKind,
	span: number,
): number {
	return kind * span * span + pairKey(a, b, span)
}

function networkKindForRouteKind(
	kind: SerializedRouteKind,
): SerializedRouteKind {
	return kind === ROUTE_SEA ? kind : ROUTE_LAND_MINOR
}

function mergeNetworkKind(
	current: SerializedRouteKind,
	next: SerializedRouteKind,
): SerializedRouteKind {
	if (current === ROUTE_SEA || next === ROUTE_SEA) {
		return ROUTE_SEA
	}
	return current === ROUTE_LAND_MAJOR || next === ROUTE_LAND_MAJOR
		? ROUTE_LAND_MAJOR
		: ROUTE_LAND_MINOR
}

function createSearchWorkspace(size: number): SearchWorkspace {
	const distance = new Float32Array(size)
	return {
		distance,
		prev: new Int32Array(size).fill(-1),
		queued: new Int32Array(size),
		settled: new Int32Array(size),
		targetStamp: new Int32Array(size),
		targetCount: new Int32Array(size),
		heap: new MinHeap(distance),
		stamp: 0,
	}
}

function createSeaNeighborWorkspace(size: number): SeaNeighborWorkspace {
	const distance = new Float32Array(size)
	return {
		distance,
		owner: new Int32Array(size).fill(-1),
		queued: new Int32Array(size),
		settled: new Int32Array(size),
		heap: new MinHeap(distance),
		stamp: 0,
	}
}

function computeLandPassableMask(state: HistoryState): Uint8Array {
	const mask = new Uint8Array(state.regionProvince.length)
	for (let region = 0; region < state.regionProvince.length; region++) {
		const province = state.regionProvince[region]
		if (
			province >= 0 &&
			!state.desolate[province] &&
			!state.stateless[province] &&
			(state.regionIsLand.length === 0 || state.regionIsLand[region])
		) {
			mask[region] = 1
		}
	}
	return mask
}

function computeProvinceLandClusters(
	state: HistoryState,
	landPassable: Uint8Array,
): Int32Array {
	const regionCluster = new Int32Array(state.regionProvince.length).fill(-1)
	const provinceCluster = new Int32Array(state.P).fill(-1)
	const queue = new Int32Array(state.regionProvince.length)
	let nextCluster = 0

	for (let region = 0; region < state.regionProvince.length; region++) {
		if (!landPassable[region] || regionCluster[region] >= 0) continue

		let head = 0
		let tail = 0
		queue[tail++] = region
		regionCluster[region] = nextCluster

		while (head < tail) {
			const current = queue[head++]
			const province = state.regionProvince[current]
			if (province >= 0 && provinceCluster[province] < 0) {
				provinceCluster[province] = nextCluster
			}
			for (
				let i = state.regionAdjOffset[current],
					end = state.regionAdjOffset[current + 1];
				i < end;
				i++
			) {
				const neighbor = state.regionAdjList[i]
				if (!landPassable[neighbor] || regionCluster[neighbor] >= 0) continue
				regionCluster[neighbor] = nextCluster
				queue[tail++] = neighbor
			}
		}

		nextCluster++
	}

	return provinceCluster
}

function computeWaterDepthPenalty(state: HistoryState): Float32Array {
	const waterDepth = new Int32Array(state.regionProvince.length).fill(-1)
	const penalty = new Float32Array(state.regionProvince.length)
	const queue = new Int32Array(state.regionProvince.length)
	let head = 0
	let tail = 0

	for (let region = 0; region < state.regionProvince.length; region++) {
		if (state.regionIsLand.length > 0 && state.regionIsLand[region]) continue
		for (
			let i = state.regionAdjOffset[region],
				end = state.regionAdjOffset[region + 1];
			i < end;
			i++
		) {
			const neighbor = state.regionAdjList[i]
			if (state.regionIsLand.length === 0 || !state.regionIsLand[neighbor]) {
				continue
			}
			waterDepth[region] = 1
			queue[tail++] = region
			break
		}
	}

	while (head < tail) {
		const current = queue[head++]
		const nextDepth = waterDepth[current] + 1
		for (
			let i = state.regionAdjOffset[current],
				end = state.regionAdjOffset[current + 1];
			i < end;
			i++
		) {
			const neighbor = state.regionAdjList[i]
			if (
				(state.regionIsLand.length > 0 && state.regionIsLand[neighbor]) ||
				waterDepth[neighbor] >= 0
			) {
				continue
			}
			waterDepth[neighbor] = nextDepth
			queue[tail++] = neighbor
		}
	}

	for (let region = 0; region < waterDepth.length; region++) {
		const depth = waterDepth[region]
		if (depth <= 0) continue
		penalty[region] =
			depth === 1
				? ROUTE_TUNING.sea.coastalPenalty
				: depth === 2
					? ROUTE_TUNING.sea.nearCoastPenalty
					: 0
	}
	return penalty
}

function tangentProjectFlat(
	regions: Int32Array | number[],
	r_xyz: Float32Array,
): Float64Array {
	let cx = 0
	let cy = 0
	let cz = 0
	for (const region of regions) {
		cx += r_xyz[region * 3]
		cy += r_xyz[region * 3 + 1]
		cz += r_xyz[region * 3 + 2]
	}
	const clen = Math.hypot(cx, cy, cz) || 1
	cx /= clen
	cy /= clen
	cz /= clen

	let ax = 0
	let ay = 0
	let az = 1
	if (Math.abs(cz) > 0.9) {
		ax = 0
		ay = 1
		az = 0
	}

	let ux = ay * cz - az * cy
	let uy = az * cx - ax * cz
	let uz = ax * cy - ay * cx
	const ulen = Math.hypot(ux, uy, uz) || 1
	ux /= ulen
	uy /= ulen
	uz /= ulen

	const vx = cy * uz - cz * uy
	const vy = cz * ux - cx * uz
	const vz = cx * uy - cy * ux

	const projected = new Float64Array(regions.length * 2)
	for (let i = 0; i < regions.length; i++) {
		const region = regions[i] ?? -1
		const x = r_xyz[region * 3]
		const y = r_xyz[region * 3 + 1]
		const z = r_xyz[region * 3 + 2]
		projected[i * 2] = x * ux + y * uy + z * uz
		projected[i * 2 + 1] = x * vx + y * vy + z * vz
	}
	return projected
}

function collectLandCandidatesByKind(
	state: HistoryState,
	settlementRegions: Int32Array,
	provinceClusters: Int32Array,
	urbanPopulation: Float32Array,
): LandCandidateGroupsByKind {
	const majorGroups = new Map<number, LandCandidateGroup>()
	const minorGroups = new Map<number, LandCandidateGroup>()
	const minLandBodySize =
		state.regionProvince.length * ROUTE_TUNING.land.minBodyShare
	for (let province = 0; province < state.P; province++) {
		const cluster = provinceClusters[province]
		const region = settlementRegions[province] ?? -1
		const landmark = region >= 0 ? state.landmarks.regionLandmark[region] : -1
		const population = urbanPopulation[province] ?? 0
		if (
			cluster < 0 ||
			region < 0 ||
			landmark < 0 ||
			(state.landmarks.size[landmark] ?? 0) < minLandBodySize ||
			state.desolate[province] ||
			population <= ROUTE_TUNING.land.minorSettlementMin
		) {
			continue
		}
		const groupKey = landmark * Math.max(1, state.P) + cluster
		const candidate: RouteCandidate = {
			province,
			region,
		}
		pushLandCandidate(minorGroups, groupKey, cluster, landmark, candidate)
		if (population > ROUTE_TUNING.land.majorSettlementMin) {
			pushLandCandidate(majorGroups, groupKey, cluster, landmark, candidate)
		}
	}
	return {
		major: [...majorGroups.values()],
		minor: [...minorGroups.values()],
	}
}

function pushLandCandidate(
	groups: Map<number, LandCandidateGroup>,
	groupKey: number,
	cluster: number,
	landmark: number,
	candidate: RouteCandidate,
): void {
	const group = groups.get(groupKey)
	if (group) {
		group.candidates.push(candidate)
		return
	}
	groups.set(groupKey, {
		cluster,
		landmark,
		candidates: [candidate],
	})
}

function collectSeaCandidates(
	state: HistoryState,
	settlementRegions: Int32Array,
	settlementWaterLandmarks: Int32Array,
	settlementPortRegions: Int32Array,
	urbanPopulation: Float32Array,
): SeaCandidateGroup[] {
	const groups = new Map<number, SeaCandidateGroup>()
	const minWaterBodySize =
		state.regionProvince.length * ROUTE_TUNING.sea.minBodyShare
	for (let province = 0; province < state.P; province++) {
		const anchorRegion = settlementRegions[province] ?? -1
		const waterLandmark = settlementWaterLandmarks[province] ?? -1
		const portRegion = settlementPortRegions[province] ?? -1
		const population = urbanPopulation[province] ?? 0
		if (
			anchorRegion < 0 ||
			waterLandmark < 0 ||
			portRegion < 0 ||
			(state.landmarks.size[waterLandmark] ?? 0) < minWaterBodySize ||
			state.desolate[province] ||
			population < ROUTE_TUNING.sea.portSettlementMin
		) {
			continue
		}
		const candidate = { province, anchorRegion, portRegion }
		const group = groups.get(waterLandmark)
		if (group) {
			group.candidates.push(candidate)
			continue
		}
		groups.set(waterLandmark, {
			waterLandmark,
			candidates: [candidate],
		})
	}
	return [...groups.values()]
}

function findLandPath(
	state: HistoryState,
	workspace: SearchWorkspace,
	startRegion: number,
	endRegion: number,
	cluster: number,
	landmark: number,
	landPassable: Uint8Array,
	provinceClusters: Int32Array,
	landEdgeUsed: Set<number>,
	regionPairSpan: number,
): number[] {
	if (startRegion < 0 || endRegion < 0) return []
	workspace.stamp++
	if (workspace.stamp === 0x7fffffff) {
		workspace.queued.fill(0)
		workspace.settled.fill(0)
		workspace.targetStamp.fill(0)
		workspace.targetCount.fill(0)
		workspace.stamp = 1
	}
	const stamp = workspace.stamp
	const heap = workspace.heap
	heap.clear()
	const { regionAdjOffset, regionAdjList, regionProvince, landmarks } = state
	const regionLandmark = landmarks.regionLandmark

	workspace.distance[startRegion] = 0
	workspace.prev[startRegion] = startRegion
	workspace.queued[startRegion] = stamp
	heap.push(startRegion)

	while (heap.size > 0) {
		const current = heap.pop()
		if (workspace.settled[current] === stamp) continue
		workspace.settled[current] = stamp
		if (current === endRegion) break
		for (
			let i = regionAdjOffset[current], end = regionAdjOffset[current + 1];
			i < end;
			i++
		) {
			const neighbor = regionAdjList[i]
			if (
				workspace.settled[neighbor] === stamp ||
				landPassable[neighbor] !== 1
			) {
				continue
			}
			const province = regionProvince[neighbor]
			if (
				province < 0 ||
				provinceClusters[province] !== cluster ||
				regionLandmark[neighbor] !== landmark
			) {
				continue
			}
			const nextDistance =
				workspace.distance[current] +
				(landEdgeUsed.has(pairKey(current, neighbor, regionPairSpan))
					? ROUTE_TUNING.land.existingEdgeCost
					: ROUTE_TUNING.land.newEdgeCost)
			if (
				workspace.queued[neighbor] !== stamp ||
				nextDistance < workspace.distance[neighbor]
			) {
				workspace.distance[neighbor] = nextDistance
				workspace.prev[neighbor] = current
				workspace.queued[neighbor] = stamp
				heap.push(neighbor)
			}
		}
	}

	return reconstructPathFromTree(workspace, startRegion, endRegion, stamp)
}

function findSeaPathsToTargets(
	state: HistoryState,
	workspace: SearchWorkspace,
	startRegion: number,
	targetRegions: ArrayLike<number>,
	waterLandmark: number,
	waterEdgeUsed: Set<number>,
	waterDepthPenalty: Float32Array,
	regionPairSpan: number,
): number {
	workspace.stamp++
	if (workspace.stamp === 0x7fffffff) {
		workspace.queued.fill(0)
		workspace.settled.fill(0)
		workspace.targetStamp.fill(0)
		workspace.targetCount.fill(0)
		workspace.stamp = 1
	}
	const stamp = workspace.stamp
	const heap = workspace.heap
	heap.clear()
	let remainingTargets = 0
	for (let i = 0; i < targetRegions.length; i++) {
		const region = targetRegions[i] ?? -1
		if (region < 0) continue
		if (workspace.targetStamp[region] !== stamp) {
			workspace.targetStamp[region] = stamp
			workspace.targetCount[region] = 1
			remainingTargets++
			continue
		}
		workspace.targetCount[region]++
	}
	workspace.distance[startRegion] = 0
	workspace.prev[startRegion] = startRegion
	workspace.queued[startRegion] = stamp
	heap.push(startRegion)

	while (heap.size > 0 && remainingTargets > 0) {
		const current = heap.pop()
		if (workspace.settled[current] === stamp) continue
		workspace.settled[current] = stamp
		if (workspace.targetStamp[current] === stamp) {
			remainingTargets -= workspace.targetCount[current]
			workspace.targetCount[current] = 0
		}
		for (
			let i = state.regionAdjOffset[current],
				end = state.regionAdjOffset[current + 1];
			i < end;
			i++
		) {
			const neighbor = state.regionAdjList[i]
			if (
				workspace.settled[neighbor] === stamp ||
				(state.regionIsLand.length > 0 && state.regionIsLand[neighbor]) ||
				state.landmarks.regionLandmark[neighbor] !== waterLandmark
			) {
				continue
			}
			const nextDistance =
				workspace.distance[current] +
				(waterEdgeUsed.has(pairKey(current, neighbor, regionPairSpan))
					? ROUTE_TUNING.sea.existingEdgeCost
					: ROUTE_TUNING.sea.newEdgeCost) +
				(waterDepthPenalty[current] + waterDepthPenalty[neighbor]) / 2
			if (
				workspace.queued[neighbor] !== stamp ||
				nextDistance < workspace.distance[neighbor]
			) {
				workspace.distance[neighbor] = nextDistance
				workspace.prev[neighbor] = current
				workspace.queued[neighbor] = stamp
				heap.push(neighbor)
			}
		}
	}

	return stamp
}

function reconstructPathFromTree(
	workspace: SearchWorkspace,
	startRegion: number,
	endRegion: number,
	stamp: number,
): number[] {
	if (workspace.settled[endRegion] !== stamp) return []
	const path: number[] = []
	for (
		let region = endRegion;
		region !== startRegion;
		region = workspace.prev[region]
	) {
		path.push(region)
	}
	path.push(startRegion)
	path.reverse()
	return path
}

function computeSeaRouteMaxLengthKm(
	sourcePopulation: number,
	targetPopulation: number,
): number {
	return sourcePopulation < ROUTE_TUNING.sea.shortRouteMaxPop &&
		targetPopulation < ROUTE_TUNING.sea.shortRouteMaxPop
		? ROUTE_TUNING.sea.shortRouteMaxLengthKm
		: ROUTE_TUNING.sea.maxLengthKm
}

function collectSeaNeighborPairs(
	state: HistoryState,
	waterLandmark: number,
	candidates: SeaCandidateGroup["candidates"],
	waterDepthPenalty: Float32Array,
	workspace: SeaNeighborWorkspace,
): Array<[number, number]> {
	workspace.stamp++
	if (workspace.stamp === 0x7fffffff) {
		workspace.queued.fill(0)
		workspace.settled.fill(0)
		workspace.owner.fill(-1)
		workspace.stamp = 1
	}
	const stamp = workspace.stamp
	const heap = workspace.heap
	heap.clear()
	const pairKeys = new Set<number>()
	const candidateSpan = candidates.length

	for (let sourceIndex = 0; sourceIndex < candidates.length; sourceIndex++) {
		const region = candidates[sourceIndex]?.portRegion ?? -1
		if (region < 0) continue
		if (workspace.queued[region] !== stamp) {
			workspace.distance[region] = 0
			workspace.owner[region] = sourceIndex
			workspace.queued[region] = stamp
			heap.push(region)
		}
	}

	while (heap.size > 0) {
		const current = heap.pop()
		if (workspace.settled[current] === stamp) continue
		workspace.settled[current] = stamp
		for (
			let i = state.regionAdjOffset[current],
				end = state.regionAdjOffset[current + 1];
			i < end;
			i++
		) {
			const neighbor = state.regionAdjList[i]
			if (
				(state.regionIsLand.length > 0 && state.regionIsLand[neighbor]) ||
				state.landmarks.regionLandmark[neighbor] !== waterLandmark
			) {
				continue
			}
			if (workspace.queued[neighbor] === stamp) {
				const currentOwner = workspace.owner[current]
				const neighborOwner = workspace.owner[neighbor]
				if (
					currentOwner >= 0 &&
					neighborOwner >= 0 &&
					currentOwner !== neighborOwner
				) {
					pairKeys.add(pairKey(currentOwner, neighborOwner, candidateSpan))
				}
			}
			const nextDistance =
				workspace.distance[current] +
				ROUTE_TUNING.sea.newEdgeCost +
				(waterDepthPenalty[current] + waterDepthPenalty[neighbor]) / 2
			if (
				workspace.queued[neighbor] !== stamp ||
				nextDistance < workspace.distance[neighbor]
			) {
				workspace.distance[neighbor] = nextDistance
				workspace.owner[neighbor] = workspace.owner[current]
				workspace.queued[neighbor] = stamp
				heap.push(neighbor)
			}
		}
	}

	return [...pairKeys]
		.map(
			(key) =>
				[Math.floor(key / candidateSpan), key % candidateSpan] as [
					number,
					number,
				],
		)
		.sort(
			([sourceA, targetA], [sourceB, targetB]) =>
				sourceA - sourceB || targetA - targetB,
		)
}

function appendLandRoutes(
	state: HistoryState,
	kind: SerializedRouteKind,
	candidateGroups: LandCandidateGroup[],
	provinceClusters: Int32Array,
	landPassable: Uint8Array,
	workspace: SearchWorkspace,
	landUsage: Set<number>,
	regionPairSpan: number,
	planetRadiusKm: number | undefined,
	provincePairSpan: number,
	blockedPairs: Set<number>,
	routes: Route[],
): void {
	const maxLengthKm =
		kind === ROUTE_LAND_MAJOR
			? ROUTE_TUNING.land.majorMaxLengthKm
			: ROUTE_TUNING.land.minorMaxLengthKm
	for (const { cluster, landmark, candidates } of candidateGroups) {
		if (candidates.length < 2) continue
		const candidateRegions = new Int32Array(candidates.length)
		for (let i = 0; i < candidates.length; i++) {
			candidateRegions[i] = candidates[i]?.region ?? -1
		}
		const points = tangentProjectFlat(candidateRegions, state.r_xyz)
		const candidatePairs = buildUrquhartEdgesFromFlat(points).sort(
			([sourceA, targetA], [sourceB, targetB]) =>
				sourceA - sourceB || targetA - targetB,
		)
		for (const [sourceIndex, targetIndex] of candidatePairs) {
			const source = candidates[sourceIndex]
			const target = candidates[targetIndex]
			const provincePairKey = pairKey(
				source.province,
				target.province,
				provincePairSpan,
			)
			if (blockedPairs.has(provincePairKey)) continue
			if (
				regionDistanceKm(
					state.r_xyz,
					source.region,
					target.region,
					planetRadiusKm,
				) > maxLengthKm
			) {
				continue
			}
			const pathRegions = findLandPath(
				state,
				workspace,
				source.region,
				target.region,
				cluster,
				landmark,
				landPassable,
				provinceClusters,
				landUsage,
				regionPairSpan,
			)
			if (pathRegions.length < 2) continue
			if (
				regionPathLengthKm(state.r_xyz, pathRegions, planetRadiusKm) >
				maxLengthKm
			) {
				continue
			}
			routes.push({
				fromProvince: source.province,
				toProvince: target.province,
				kind,
				pathRegions,
			})
			for (let i = 1; i < pathRegions.length; i++) {
				landUsage.add(
					pairKey(pathRegions[i - 1], pathRegions[i], regionPairSpan),
				)
			}
		}
	}
}

function appendSeaRoutes(
	state: HistoryState,
	candidateGroups: SeaCandidateGroup[],
	waterDepthPenalty: Float32Array,
	workspace: SearchWorkspace,
	neighborWorkspace: SeaNeighborWorkspace,
	seaUsage: Set<number>,
	regionPairSpan: number,
	urbanPopulation: Float32Array,
	planetRadiusKm: number | undefined,
	routes: Route[],
): void {
	for (const { waterLandmark, candidates } of candidateGroups) {
		if (candidates.length < 2) continue
		const candidatePopulation = new Float32Array(candidates.length)
		for (let i = 0; i < candidates.length; i++) {
			candidatePopulation[i] =
				urbanPopulation[candidates[i]?.province ?? -1] ?? 0
		}
		const candidatePairs = collectSeaNeighborPairs(
			state,
			waterLandmark,
			candidates,
			waterDepthPenalty,
			neighborWorkspace,
		)
		const targetIndexScratch = new Int32Array(candidatePairs.length)
		const targetPortScratch = new Int32Array(candidatePairs.length)
		const maxLengthScratch = new Float32Array(candidatePairs.length)
		const singleTargetRegion = new Int32Array(1)
		for (let pairIndex = 0; pairIndex < candidatePairs.length; ) {
			const sourceIndex = candidatePairs[pairIndex]?.[0] ?? -1
			if (sourceIndex < 0) {
				pairIndex++
				continue
			}
			const source = candidates[sourceIndex]
			const sourcePop = candidatePopulation[sourceIndex] ?? 0
			let routableTargetCount = 0
			while (
				pairIndex < candidatePairs.length &&
				(candidatePairs[pairIndex]?.[0] ?? -1) === sourceIndex
			) {
				const targetIndex = candidatePairs[pairIndex]?.[1] ?? -1
				pairIndex++
				if (targetIndex < 0) continue
				const target = candidates[targetIndex]
				const targetPop = candidatePopulation[targetIndex] ?? 0
				const maxLen = computeSeaRouteMaxLengthKm(sourcePop, targetPop)
				if (
					Math.max(
						regionDistanceKm(
							state.r_xyz,
							source.anchorRegion,
							target.anchorRegion,
							planetRadiusKm,
						),
						regionDistanceKm(
							state.r_xyz,
							source.portRegion,
							target.portRegion,
							planetRadiusKm,
						),
					) > maxLen
				) {
					continue
				}
				targetIndexScratch[routableTargetCount] = targetIndex
				targetPortScratch[routableTargetCount] = target.portRegion
				maxLengthScratch[routableTargetCount] = maxLen
				routableTargetCount++
			}
			if (routableTargetCount === 0) continue
			for (let i = 0; i < routableTargetCount; i++) {
				const targetIndex = targetIndexScratch[i] ?? -1
				const target = candidates[targetIndex]
				const maxLen = maxLengthScratch[i] ?? 0
				singleTargetRegion[0] = targetPortScratch[i] ?? -1
				const searchStamp = findSeaPathsToTargets(
					state,
					workspace,
					source.portRegion,
					singleTargetRegion,
					waterLandmark,
					seaUsage,
					waterDepthPenalty,
					regionPairSpan,
				)
				const waterPath = reconstructPathFromTree(
					workspace,
					source.portRegion,
					target.portRegion,
					searchStamp,
				)
				if (waterPath.length < 2) continue
				const pathRegions = [
					source.anchorRegion,
					...waterPath,
					target.anchorRegion,
				]
				const lengthKm = regionPathLengthKm(
					state.r_xyz,
					pathRegions,
					planetRadiusKm,
				)
				if (lengthKm > maxLen) continue
				routes.push({
					fromProvince: source.province,
					toProvince: target.province,
					kind: ROUTE_SEA,
					pathRegions,
				})
				for (let i = 2; i < pathRegions.length - 1; i++) {
					seaUsage.add(
						pairKey(pathRegions[i - 1], pathRegions[i], regionPairSpan),
					)
				}
			}
		}
	}
}

function buildRouteNetwork(
	routes: Route[],
	state: HistoryState,
	urbanPopulation: Float32Array,
): RouteEdge[] {
	const regionPairSpan = state.regionProvince.length
	const edgeMap = new Map<number, RouteEdge>()
	for (const route of routes) {
		const weight =
			((urbanPopulation[route.fromProvince] ?? 0) +
				(urbanPopulation[route.toProvince] ?? 0)) /
			2
		for (let i = 1; i < route.pathRegions.length; i++) {
			const fromRegion = route.pathRegions[i - 1]
			const toRegion = route.pathRegions[i]
			if (fromRegion === toRegion) continue
			const key = edgeKey(
				fromRegion,
				toRegion,
				networkKindForRouteKind(route.kind),
				regionPairSpan,
			)
			const existing = edgeMap.get(key)
			if (existing) {
				existing.kind = mergeNetworkKind(existing.kind, route.kind)
				existing.usage++
				existing.weight += weight
				continue
			}
			edgeMap.set(key, {
				fromRegion: Math.min(fromRegion, toRegion),
				toRegion: Math.max(fromRegion, toRegion),
				kind: route.kind,
				usage: 1,
				weight,
			})
		}
	}
	return [...edgeMap.values()].sort(
		(a, b) => a.kind - b.kind || b.usage - a.usage || b.weight - a.weight,
	)
}

export function computeRoutes(
	state: HistoryState,
	inputs: RouteInputs,
): RouteComputation {
	const settlementRegions =
		inputs.settlementRegions ?? new Int32Array(state.P).fill(-1)
	const settlementWaterLandmarks =
		inputs.settlementWaterLandmarks ?? new Int32Array(state.P).fill(-1)
	const settlementPortRegions =
		inputs.settlementPortRegions ?? new Int32Array(state.P).fill(-1)
	const urbanPopulation = new Float32Array(state.P)
	for (let province = 0; province < state.P; province++) {
		urbanPopulation[province] = PROV.population.urban.get(state, province)
	}

	const landPassable = timed(
		"computeRoutes:computeLandPassableMask",
		inputs.timings,
		() => computeLandPassableMask(state),
	)
	const waterDepthPenalty = timed(
		"computeRoutes:computeWaterDepthPenalty",
		inputs.timings,
		() => computeWaterDepthPenalty(state),
	)
	const provinceClusters = timed(
		"computeRoutes:computeProvinceLandClusters",
		inputs.timings,
		() => computeProvinceLandClusters(state, landPassable),
	)
	const workspace = createSearchWorkspace(state.regionProvince.length)
	const neighborWorkspace = createSeaNeighborWorkspace(
		state.regionProvince.length,
	)
	const regionPairSpan = state.regionProvince.length
	const provincePairSpan = state.P
	const landCandidates = collectLandCandidatesByKind(
		state,
		settlementRegions,
		provinceClusters,
		urbanPopulation,
	)
	const landUsage = new Set<number>()
	const seaUsage = new Set<number>()
	const routes: Route[] = []
	const majorPairs = new Set<number>()

	timed("computeRoutes:appendLandRoutes-major", inputs.timings, () =>
		appendLandRoutes(
			state,
			ROUTE_LAND_MAJOR,
			landCandidates.major,
			provinceClusters,
			landPassable,
			workspace,
			landUsage,
			regionPairSpan,
			inputs.planetRadiusKm,
			provincePairSpan,
			new Set<number>(),
			routes,
		),
	)
	for (const route of routes) {
		if (route.kind !== ROUTE_LAND_MAJOR) continue
		majorPairs.add(
			pairKey(route.fromProvince, route.toProvince, provincePairSpan),
		)
	}
	timed("computeRoutes:appendLandRoutes-minor", inputs.timings, () =>
		appendLandRoutes(
			state,
			ROUTE_LAND_MINOR,
			landCandidates.minor,
			provinceClusters,
			landPassable,
			workspace,
			landUsage,
			regionPairSpan,
			inputs.planetRadiusKm,
			provincePairSpan,
			majorPairs,
			routes,
		),
	)
	timed("computeRoutes:appendSeaRoutes", inputs.timings, () =>
		appendSeaRoutes(
			state,
			collectSeaCandidates(
				state,
				settlementRegions,
				settlementWaterLandmarks,
				settlementPortRegions,
				urbanPopulation,
			),
			waterDepthPenalty,
			workspace,
			neighborWorkspace,
			seaUsage,
			regionPairSpan,
			urbanPopulation,
			inputs.planetRadiusKm,
			routes,
		),
	)

	return {
		routes,
		network: timed("computeRoutes:buildRouteNetwork", inputs.timings, () =>
			buildRouteNetwork(routes, state, urbanPopulation),
		),
	}
}
