import { UNITS } from "@/model/shared/units"
import { URQUHART } from "@/model/shared/urquhart"
import { PATHFIND } from "@/model/society/infrastructure/pathfinding"
import {
	ROUTE_TUNING,
	routePopulationThresholds,
} from "@/model/society/infrastructure/trade/routing/route-tuning"
import type {
	LandCandidateGroup,
	LandCandidateGroupsByKind,
	RouteCandidate,
	RouteWorld,
	SearchWorkspace,
} from "@/model/society/infrastructure/trade/routing/types"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type {
	Route,
	SerializedRouteKind,
} from "@/model/society/infrastructure/transport/types"

export function computeLandPassableMask(state: RouteWorld): Uint8Array {
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

export function computeProvinceLandClusters({
	state,
	landPassable,
}: {
	state: RouteWorld
	landPassable: Uint8Array
}): Int32Array {
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

export function collectLandCandidatesByKind({
	state,
	settlementRegions,
	provinceClusters,
	urbanPopulation,
}: {
	state: RouteWorld
	settlementRegions: Int32Array
	provinceClusters: Int32Array
	urbanPopulation: Float32Array
}): LandCandidateGroupsByKind {
	const thresholds = routePopulationThresholds(state.era)
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
			population <= thresholds.minorSettlementMin
		) {
			continue
		}
		const groupKey = landmark * Math.max(1, state.P) + cluster
		const candidate: RouteCandidate = {
			province,
			region,
		}
		pushLandCandidate({
			groups: minorGroups,
			groupKey,
			cluster,
			landmark,
			candidate,
		})
		if (population > thresholds.majorSettlementMin) {
			pushLandCandidate({
				groups: majorGroups,
				groupKey,
				cluster,
				landmark,
				candidate,
			})
		}
	}
	return {
		major: [...majorGroups.values()],
		minor: [...minorGroups.values()],
	}
}

function pushLandCandidate({
	groups,
	groupKey,
	cluster,
	landmark,
	candidate,
}: {
	groups: Map<number, LandCandidateGroup>
	groupKey: number
	cluster: number
	landmark: number
	candidate: RouteCandidate
}): void {
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

function findLandPath({
	state,
	workspace,
	startRegion,
	endRegion,
	cluster,
	landmark,
	landPassable,
	provinceClusters,
	landEdgeUsed,
	regionPairSpan,
}: {
	state: RouteWorld
	workspace: SearchWorkspace
	startRegion: number
	endRegion: number
	cluster: number
	landmark: number
	landPassable: Uint8Array
	provinceClusters: Int32Array
	landEdgeUsed: Set<number>
	regionPairSpan: number
}): number[] {
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
				(landEdgeUsed.has(
					PATHFIND.pairKey({ a: current, b: neighbor, span: regionPairSpan }),
				)
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

	return PATHFIND.reconstructPathFromTree({
		workspace,
		startRegion,
		endRegion,
		stamp,
	})
}

export function appendLandRoutes({
	state,
	kind,
	candidateGroups,
	provinceClusters,
	landPassable,
	workspace,
	landUsage,
	regionPairSpan,
	planetRadiusKm,
	provincePairSpan,
	blockedPairs,
	routes,
}: {
	state: RouteWorld
	kind: SerializedRouteKind
	candidateGroups: LandCandidateGroup[]
	provinceClusters: Int32Array
	landPassable: Uint8Array
	workspace: SearchWorkspace
	landUsage: Set<number>
	regionPairSpan: number
	planetRadiusKm: number | undefined
	provincePairSpan: number
	blockedPairs: Set<number>
	routes: Route[]
}): void {
	const maxLengthKm =
		kind === TRANSPORT.ROUTE_LAND_MAJOR
			? ROUTE_TUNING.land.majorMaxLengthKm
			: ROUTE_TUNING.land.minorMaxLengthKm
	for (const { cluster, landmark, candidates } of candidateGroups) {
		if (candidates.length < 2) continue
		const candidateRegions = new Int32Array(candidates.length)
		for (let i = 0; i < candidates.length; i++) {
			candidateRegions[i] = candidates[i]?.region ?? -1
		}
		const points = PATHFIND.tangentProjectFlat({
			regions: candidateRegions,
			r_xyz: state.r_xyz,
		})
		const candidatePairs = URQUHART.buildUrquhartEdgesFromFlat(points).sort(
			([sourceA, targetA], [sourceB, targetB]) =>
				sourceA - sourceB || targetA - targetB,
		)
		for (const [sourceIndex, targetIndex] of candidatePairs) {
			const source = candidates[sourceIndex]
			const target = candidates[targetIndex]
			const provincePairKey = PATHFIND.pairKey({
				a: source.province,
				b: target.province,
				span: provincePairSpan,
			})
			if (blockedPairs.has(provincePairKey)) continue
			if (
				UNITS.regionDistanceKm({
					r_xyz: state.r_xyz,
					fromRegion: source.region,
					toRegion: target.region,
					planetRadiusKm,
				}) > maxLengthKm
			) {
				continue
			}
			const pathRegions = findLandPath({
				state,
				workspace,
				startRegion: source.region,
				endRegion: target.region,
				cluster,
				landmark,
				landPassable,
				provinceClusters,
				landEdgeUsed: landUsage,
				regionPairSpan,
			})
			if (pathRegions.length < 2) continue
			if (
				UNITS.regionPathLengthKm({
					r_xyz: state.r_xyz,
					pathRegions,
					planetRadiusKm,
				}) > maxLengthKm
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
