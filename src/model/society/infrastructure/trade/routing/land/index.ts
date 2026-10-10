import { UNITS } from "@/model/shared/units"
import { URQUHART } from "@/model/shared/urquhart"
import { PATHFIND } from "@/model/society/infrastructure/pathfinding"
import { EDGE_USAGE } from "@/model/society/infrastructure/trade/routing/edge-usage"
import type { AppendLandRoutesParams } from "@/model/society/infrastructure/trade/routing/land/types"
import {
	ROUTE_TUNING,
	routePopulationThresholds,
} from "@/model/society/infrastructure/trade/routing/route-tuning"
import { ROUTE_SEARCH } from "@/model/society/infrastructure/trade/routing/search"
import type {
	LandCandidateGroup,
	LandCandidateGroupsByKind,
	RouteCandidate,
	RouteWorld,
} from "@/model/society/infrastructure/trade/routing/types"
import { TRANSPORT } from "@/model/society/infrastructure/transport"

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

export function appendLandRoutes({
	state,
	kind,
	candidateGroups,
	groupIds,
	workspace,
	landUsage,
	planetRadiusKm,
	provincePairSpan,
	blockedPairs,
	routes,
}: AppendLandRoutesParams): void {
	const maxLengthKm =
		kind === TRANSPORT.ROUTE_LAND_MAJOR
			? ROUTE_TUNING.land.majorMaxLengthKm
			: ROUTE_TUNING.land.minorMaxLengthKm
	for (const { cluster, landmark, candidates } of candidateGroups) {
		if (candidates.length < 2) continue
		const groupId = landmark * state.regionProvince.length + cluster
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
			const pathRegions = ROUTE_SEARCH.findPath({
				state,
				workspace,
				startRegion: source.region,
				endRegion: target.region,
				groupId,
				groupIds,
				edgeUsed: landUsage,
				waterDepthPenalty: null,
				kind: "land",
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
			EDGE_USAGE.recordPath({
				adjOffset: state.regionAdjOffset,
				adjList: state.regionAdjList,
				counts: landUsage,
				pathRegions,
				firstEdge: 1,
				endEdge: pathRegions.length,
			})
		}
	}
}
