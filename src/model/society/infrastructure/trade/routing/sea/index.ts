import { BUCKET_QUEUE } from "@/model/shared/bucket-queue"
import { UNITS } from "@/model/shared/units"
import { PATHFIND } from "@/model/society/infrastructure/pathfinding"
import { EDGE_USAGE } from "@/model/society/infrastructure/trade/routing/edge-usage"
import {
	ROUTE_TUNING,
	routePopulationThresholds,
} from "@/model/society/infrastructure/trade/routing/route-tuning"
import type { AppendSeaRoutesParams } from "@/model/society/infrastructure/trade/routing/sea/types"
import { ROUTE_SEARCH } from "@/model/society/infrastructure/trade/routing/search"
import type {
	RouteWorld,
	SeaCandidateGroup,
	SeaNeighborWorkspace,
} from "@/model/society/infrastructure/trade/routing/types"
import { TRANSPORT } from "@/model/society/infrastructure/transport"

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
			if (waterDepth[neighbor] >= 0) {
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
	const queue = workspace.queue
	queue.clear()
	const pairKeys = new Set<number>()
	const candidateSpan = candidates.length

	for (let sourceIndex = 0; sourceIndex < candidates.length; sourceIndex++) {
		const region = candidates[sourceIndex]?.portRegion ?? -1
		if (region < 0) continue
		if (workspace.queued[region] !== stamp) {
			workspace.distance[region] = 0
			workspace.owner[region] = sourceIndex
			workspace.queued[region] = stamp
			queue.push(region)
		}
	}

	while (queue.size > 0) {
		const current = queue.pop()
		if (current < 0) break
		if (workspace.settled[current] === stamp) continue
		workspace.settled[current] = stamp
		for (
			let i = state.regionAdjOffset[current],
				end = state.regionAdjOffset[current + 1];
			i < end;
			i++
		) {
			const neighbor = state.regionAdjList[i]
			if (state.landmarks.regionLandmark[neighbor] !== waterLandmark) {
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
				ROUTE_TUNING.sea.newEdgeCost * ROUTE_TUNING.search.costScale +
				(waterDepthPenalty[current] + waterDepthPenalty[neighbor]) *
					(ROUTE_TUNING.search.costScale / 2)
			if (
				workspace.queued[neighbor] !== stamp ||
				nextDistance < workspace.distance[neighbor]
			) {
				workspace.distance[neighbor] = nextDistance
				workspace.owner[neighbor] = workspace.owner[current]
				workspace.queued[neighbor] = stamp
				queue.push(neighbor)
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

export function appendSeaRoutes({
	state,
	candidateGroups,
	waterDepthPenalty,
	workspace,
	neighborWorkspace,
	seaUsage,
	urbanPopulation,
	planetRadiusKm,
	routes,
}: AppendSeaRoutesParams): void {
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
				const waterPath = ROUTE_SEARCH.findPath({
					state,
					workspace,
					startRegion: source.portRegion,
					endRegion: targetPortScratch[i] ?? -1,
					groupId: waterLandmark,
					groupIds: null,
					edgeUsed: seaUsage,
					waterDepthPenalty,
					kind: "sea",
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
				EDGE_USAGE.recordPath({
					adjOffset: state.regionAdjOffset,
					adjList: state.regionAdjList,
					counts: seaUsage,
					pathRegions,
					firstEdge: 2,
					endEdge: pathRegions.length - 1,
				})
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
		queue: BUCKET_QUEUE.create({
			distance,
			bucketCount: ROUTE_TUNING.search.seaBucketCount,
		}),
		stamp: 0,
	}
}
