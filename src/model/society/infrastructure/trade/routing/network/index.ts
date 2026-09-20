import { MinHeap } from "@/model/shared/min-heap"
import { ERAS } from "@/model/society/eras"
import { PATHFIND } from "@/model/society/infrastructure/pathfinding"
import {
	appendLandRoutes,
	collectLandCandidatesByKind,
	computeLandPassableMask,
	computeProvinceLandClusters,
} from "@/model/society/infrastructure/trade/routing/land/index"
import {
	appendSeaRoutes,
	collectSeaCandidates,
	computeWaterDepthPenalty,
	createSeaNeighborWorkspace,
} from "@/model/society/infrastructure/trade/routing/sea/index"
import type {
	RouteComputation,
	RouteInputs,
	RouteWorld,
	RouteWorldInput,
	SearchWorkspace,
} from "@/model/society/infrastructure/trade/routing/types"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type {
	Route,
	RouteEdge,
	SerializedRouteKind,
} from "@/model/society/infrastructure/transport/types"

function toRouteWorld(input: RouteWorldInput): RouteWorld {
	const { provinces, nations } = input
	const stateless = new Uint8Array(provinces.count)
	for (let p = 0; p < provinces.count; p++) {
		if (!provinces.desolate[p] && nations.sovereign[p] < 0) stateless[p] = 1
	}
	return {
		P: provinces.count,
		era: input.params.era ?? ERAS.defaultEra,
		desolate: provinces.desolate,
		stateless,
		regionProvince: provinces.regionProvince,
		regionAdjOffset: input.mesh.adjOffset,
		regionAdjList: input.mesh.adjList,
		regionIsLand: input.isLand,
		r_xyz: input.mesh.r_xyz,
		landmarks: input.landmarks,
	}
}

function timed<T>({
	label,
	timings,
	fn,
}: {
	label: string
	timings: Array<{ Stage: string; ms: string }> | undefined
	fn: () => T
}): T {
	const t0 = performance.now()
	const result = fn()
	if (timings) {
		timings.push({ Stage: label, ms: (performance.now() - t0).toFixed(1) })
	}
	return result
}

function edgeKey({
	a,
	b,
	kind,
	span,
}: {
	a: number
	b: number
	kind: SerializedRouteKind
	span: number
}): number {
	return kind * span * span + PATHFIND.pairKey({ a, b, span })
}

function networkKindForRouteKind(
	kind: SerializedRouteKind,
): SerializedRouteKind {
	return kind === TRANSPORT.ROUTE_SEA ? kind : TRANSPORT.ROUTE_LAND_MINOR
}

function mergeNetworkKind({
	current,
	next,
}: {
	current: SerializedRouteKind
	next: SerializedRouteKind
}): SerializedRouteKind {
	if (current === TRANSPORT.ROUTE_SEA || next === TRANSPORT.ROUTE_SEA) {
		return TRANSPORT.ROUTE_SEA
	}
	return current === TRANSPORT.ROUTE_LAND_MAJOR ||
		next === TRANSPORT.ROUTE_LAND_MAJOR
		? TRANSPORT.ROUTE_LAND_MAJOR
		: TRANSPORT.ROUTE_LAND_MINOR
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

function buildRouteNetwork({
	routes,
	state,
	urbanPopulation,
}: {
	routes: Route[]
	state: RouteWorld
	urbanPopulation: Float32Array
}): RouteEdge[] {
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
			const key = edgeKey({
				a: fromRegion,
				b: toRegion,
				kind: networkKindForRouteKind(route.kind),
				span: regionPairSpan,
			})
			const existing = edgeMap.get(key)
			if (existing) {
				existing.kind = mergeNetworkKind({
					current: existing.kind,
					next: route.kind,
				})
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

function computeRoutes({
	world,
	inputs,
}: {
	world: RouteWorldInput
	inputs: RouteInputs
}): RouteComputation {
	const state = toRouteWorld(world)
	const settlementRegions =
		inputs.settlementRegions ?? new Int32Array(state.P).fill(-1)
	const settlementWaterLandmarks =
		inputs.settlementWaterLandmarks ?? new Int32Array(state.P).fill(-1)
	const settlementPortRegions =
		inputs.settlementPortRegions ?? new Int32Array(state.P).fill(-1)
	const { urbanPopulation } = inputs

	const landPassable = timed({
		label: "computeRoutes:computeLandPassableMask",
		timings: inputs.timings,
		fn: () => computeLandPassableMask(state),
	})
	const waterDepthPenalty = timed({
		label: "computeRoutes:computeWaterDepthPenalty",
		timings: inputs.timings,
		fn: () => computeWaterDepthPenalty(state),
	})
	const provinceClusters = timed({
		label: "computeRoutes:computeProvinceLandClusters",
		timings: inputs.timings,
		fn: () => computeProvinceLandClusters({ state, landPassable }),
	})
	const workspace = createSearchWorkspace(state.regionProvince.length)
	const neighborWorkspace = createSeaNeighborWorkspace(
		state.regionProvince.length,
	)
	const regionPairSpan = state.regionProvince.length
	const provincePairSpan = state.P
	const landCandidates = collectLandCandidatesByKind({
		state,
		settlementRegions,
		provinceClusters,
		urbanPopulation,
	})
	const landUsage = new Set<number>()
	const seaUsage = new Set<number>()
	const routes: Route[] = []
	const majorPairs = new Set<number>()

	timed({
		label: "computeRoutes:appendLandRoutes-major",
		timings: inputs.timings,
		fn: () =>
			appendLandRoutes({
				state,
				kind: TRANSPORT.ROUTE_LAND_MAJOR,
				candidateGroups: landCandidates.major,
				provinceClusters,
				landPassable,
				workspace,
				landUsage,
				regionPairSpan,
				planetRadiusKm: world.params.planetRadiusKm,
				provincePairSpan,
				blockedPairs: new Set<number>(),
				routes,
			}),
	})
	for (const route of routes) {
		if (route.kind !== TRANSPORT.ROUTE_LAND_MAJOR) continue
		majorPairs.add(
			PATHFIND.pairKey({
				a: route.fromProvince,
				b: route.toProvince,
				span: provincePairSpan,
			}),
		)
	}
	timed({
		label: "computeRoutes:appendLandRoutes-minor",
		timings: inputs.timings,
		fn: () =>
			appendLandRoutes({
				state,
				kind: TRANSPORT.ROUTE_LAND_MINOR,
				candidateGroups: landCandidates.minor,
				provinceClusters,
				landPassable,
				workspace,
				landUsage,
				regionPairSpan,
				planetRadiusKm: world.params.planetRadiusKm,
				provincePairSpan,
				blockedPairs: majorPairs,
				routes,
			}),
	})
	timed({
		label: "computeRoutes:appendSeaRoutes",
		timings: inputs.timings,
		fn: () =>
			appendSeaRoutes({
				state,
				candidateGroups: collectSeaCandidates({
					state,
					settlementRegions,
					settlementWaterLandmarks,
					settlementPortRegions,
					urbanPopulation,
				}),
				waterDepthPenalty,
				workspace,
				neighborWorkspace,
				seaUsage,
				regionPairSpan,
				urbanPopulation,
				planetRadiusKm: world.params.planetRadiusKm,
				routes,
			}),
	})

	return {
		routes,
		network: timed({
			label: "computeRoutes:buildRouteNetwork",
			timings: inputs.timings,
			fn: () => buildRouteNetwork({ routes, state, urbanPopulation }),
		}),
	}
}

export const ROUTES = {
	computeRoutes,
}
