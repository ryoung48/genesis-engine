import { MinHeap } from "@/model/shared/min-heap"
import { UNITS } from "@/model/shared/units"
import { PATHFIND } from "@/model/society/infrastructure/pathfinding"
import {
	ROUTE_TUNING,
	routePopulationThresholds,
} from "@/model/society/infrastructure/trade/routing/route-tuning"
import type {
	RouteWorld,
	SeaCandidateGroup,
	SeaNeighborWorkspace,
	SearchWorkspace,
} from "@/model/society/infrastructure/trade/routing/types"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type { Route } from "@/model/society/infrastructure/transport/types"

export function collectSeaCandidates({
	state,
	settlementRegions,
	settlementWaterLandmarks,
	settlementPortRegions,
	urbanPopulation,
}: {
	state: RouteWorld
	settlementRegions: Int32Array
	settlementWaterLandmarks: Int32Array
	settlementPortRegions: Int32Array
	urbanPopulation: Float32Array
}): SeaCandidateGroup[] {
	const thresholds = routePopulationThresholds(state.era)
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
			population < thresholds.portSettlementMin
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

export function computeWaterDepthPenalty(state: RouteWorld): Float32Array {
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

function computeSeaRouteMaxLengthKm({
	state,
	sourcePopulation,
	targetPopulation,
}: {
	state: RouteWorld
	sourcePopulation: number
	targetPopulation: number
}): number {
	const thresholds = routePopulationThresholds(state.era)
	return sourcePopulation < thresholds.shortRouteMaxPop &&
		targetPopulation < thresholds.shortRouteMaxPop
		? ROUTE_TUNING.sea.shortRouteMaxLengthKm
		: ROUTE_TUNING.sea.maxLengthKm
}

function collectSeaNeighborPairs({
	state,
	waterLandmark,
	candidates,
	waterDepthPenalty,
	workspace,
}: {
	state: RouteWorld
	waterLandmark: number
	candidates: SeaCandidateGroup["candidates"]
	waterDepthPenalty: Float32Array
	workspace: SeaNeighborWorkspace
}): Array<[number, number]> {
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
					pairKeys.add(
						PATHFIND.pairKey({
							a: currentOwner,
							b: neighborOwner,
							span: candidateSpan,
						}),
					)
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

function findSeaPathsToTargets({
	state,
	workspace,
	startRegion,
	targetRegions,
	waterLandmark,
	waterEdgeUsed,
	waterDepthPenalty,
	regionPairSpan,
}: {
	state: RouteWorld
	workspace: SearchWorkspace
	startRegion: number
	targetRegions: ArrayLike<number>
	waterLandmark: number
	waterEdgeUsed: Set<number>
	waterDepthPenalty: Float32Array
	regionPairSpan: number
}): number {
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
				(waterEdgeUsed.has(
					PATHFIND.pairKey({ a: current, b: neighbor, span: regionPairSpan }),
				)
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

export function appendSeaRoutes({
	state,
	candidateGroups,
	waterDepthPenalty,
	workspace,
	neighborWorkspace,
	seaUsage,
	regionPairSpan,
	urbanPopulation,
	planetRadiusKm,
	routes,
}: {
	state: RouteWorld
	candidateGroups: SeaCandidateGroup[]
	waterDepthPenalty: Float32Array
	workspace: SearchWorkspace
	neighborWorkspace: SeaNeighborWorkspace
	seaUsage: Set<number>
	regionPairSpan: number
	urbanPopulation: Float32Array
	planetRadiusKm: number | undefined
	routes: Route[]
}): void {
	for (const { waterLandmark, candidates } of candidateGroups) {
		if (candidates.length < 2) continue
		const candidatePopulation = new Float32Array(candidates.length)
		for (let i = 0; i < candidates.length; i++) {
			candidatePopulation[i] =
				urbanPopulation[candidates[i]?.province ?? -1] ?? 0
		}
		const candidatePairs = collectSeaNeighborPairs({
			state,
			waterLandmark,
			candidates,
			waterDepthPenalty,
			workspace: neighborWorkspace,
		})
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
				const maxLen = computeSeaRouteMaxLengthKm({
					state,
					sourcePopulation: sourcePop,
					targetPopulation: targetPop,
				})
				if (
					Math.max(
						UNITS.regionDistanceKm({
							r_xyz: state.r_xyz,
							fromRegion: source.anchorRegion,
							toRegion: target.anchorRegion,
							planetRadiusKm,
						}),
						UNITS.regionDistanceKm({
							r_xyz: state.r_xyz,
							fromRegion: source.portRegion,
							toRegion: target.portRegion,
							planetRadiusKm,
						}),
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
				const searchStamp = findSeaPathsToTargets({
					state,
					workspace,
					startRegion: source.portRegion,
					targetRegions: singleTargetRegion,
					waterLandmark,
					waterEdgeUsed: seaUsage,
					waterDepthPenalty,
					regionPairSpan,
				})
				const waterPath = PATHFIND.reconstructPathFromTree({
					workspace,
					startRegion: source.portRegion,
					endRegion: target.portRegion,
					stamp: searchStamp,
				})
				if (waterPath.length < 2) continue
				const pathRegions = [
					source.anchorRegion,
					...waterPath,
					target.anchorRegion,
				]
				const lengthKm = UNITS.regionPathLengthKm({
					r_xyz: state.r_xyz,
					pathRegions,
					planetRadiusKm,
				})
				if (lengthKm > maxLen) continue
				routes.push({
					fromProvince: source.province,
					toProvince: target.province,
					kind: TRANSPORT.ROUTE_SEA,
					pathRegions,
				})
				for (let i = 2; i < pathRegions.length - 1; i++) {
					seaUsage.add(
						PATHFIND.pairKey({
							a: pathRegions[i - 1],
							b: pathRegions[i],
							span: regionPairSpan,
						}),
					)
				}
			}
		}
	}
}

export function createSeaNeighborWorkspace(size: number): SeaNeighborWorkspace {
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
