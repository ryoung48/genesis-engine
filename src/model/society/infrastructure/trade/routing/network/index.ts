import { BUCKET_QUEUE } from "@/model/shared/bucket-queue"
import { TIMING } from "@/model/shared/timing"
import { PATHFIND } from "@/model/society/infrastructure/pathfinding"
import { EDGE_USAGE } from "@/model/society/infrastructure/trade/routing/edge-usage"
import { LAND_ELIGIBILITY } from "@/model/society/infrastructure/trade/routing/land/eligibility"
import { LAND_ROUTES } from "@/model/society/infrastructure/trade/routing/land/index"
import { ROUTE_MEMBERSHIP } from "@/model/society/infrastructure/trade/routing/membership"
import { ROUTE_EDGES } from "@/model/society/infrastructure/trade/routing/network/edges/index"
import type { RecordUsageParams } from "@/model/society/infrastructure/trade/routing/network/types"
import { ROUTE_TUNING } from "@/model/society/infrastructure/trade/routing/route-tuning"
import { SEA_ROUTES } from "@/model/society/infrastructure/trade/routing/sea/index"
import type {
	AdvanceRoutesParams,
	CreateRouteStateParams,
	RouteBatch,
	RouteComputation,
	RouteState,
	RouteWorld,
	RouteWorldInput,
	SearchWorkspace,
} from "@/model/society/infrastructure/trade/routing/types"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type { Route } from "@/model/society/infrastructure/transport/types"

function toRouteWorld(input: RouteWorldInput): RouteWorld {
	const { provinces, nations } = input
	const stateless = new Uint8Array(provinces.count)
	for (let p = 0; p < provinces.count; p++) {
		if (!provinces.desolate[p] && nations.sovereign[p] < 0) stateless[p] = 1
	}
	return {
		P: provinces.count,
		era: input.params.era ?? "lateMedieval",
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

function createSearchWorkspace(size: number): SearchWorkspace {
	const distance = new Float32Array(size)
	return {
		distance,
		prev: new Int32Array(size).fill(-1),
		queued: new Int32Array(size),
		settled: new Int32Array(size),
		landQueue: BUCKET_QUEUE.create({
			distance,
			bucketCount: ROUTE_TUNING.search.landBucketCount,
		}),
		seaQueue: BUCKET_QUEUE.create({
			distance,
			bucketCount: ROUTE_TUNING.search.seaBucketCount,
		}),
		stamp: 0,
	}
}

function createState({ world, inputs }: CreateRouteStateParams): RouteState {
	const state = toRouteWorld(world)
	const landPassable = LAND_ROUTES.computeLandPassableMask(state)
	const provinceClusters = LAND_ROUTES.computeProvinceLandClusters({
		state,
		landPassable,
	})
	const centers = new Map<number, readonly [number, number, number]>()
	const eligible = LAND_ROUTES.collectLandCandidatesByKind({
		state,
		settlementRegions:
			inputs.settlementRegions ?? new Int32Array(state.P).fill(-1),
		provinceClusters,
		urbanPopulation: new Float32Array(state.P).fill(Infinity),
		membership: null,
	})
	for (const group of eligible.minor)
		centers.set(
			group.landmark * Math.max(1, state.P) + group.cluster,
			PATHFIND.centroid({
				regions: group.candidates.map((candidate) => candidate.region),
				r_xyz: state.r_xyz,
			}),
		)
	const landGroups = new Float64Array(state.P).fill(-1)
	for (const group of eligible.minor)
		for (const candidate of group.candidates)
			landGroups[candidate.province] =
				group.landmark * Math.max(1, state.P) + group.cluster
	const seaGroups = new Int32Array(state.P).fill(-1)
	const eligibleSea = SEA_ROUTES.collectSeaCandidates({
		state,
		settlementRegions:
			inputs.settlementRegions ?? new Int32Array(state.P).fill(-1),
		settlementWaterLandmarks:
			inputs.settlementWaterLandmarks ?? new Int32Array(state.P).fill(-1),
		settlementPortRegions:
			inputs.settlementPortRegions ?? new Int32Array(state.P).fill(-1),
		urbanPopulation: new Float32Array(state.P).fill(Infinity),
		membership: null,
	})
	for (const group of eligibleSea)
		for (const candidate of group.candidates)
			seaGroups[candidate.province] = group.waterLandmark
	return {
		centers,
		landGroups,
		seaGroups,
		longSea: new Uint8Array(state.P),
		membership: Array.from({ length: 3 }, () => new Uint8Array(state.P)),
		enteredBatch: Array.from({ length: 3 }, () =>
			new Int32Array(state.P).fill(-1),
		),
		batches: [],
		world: state,
		settlementRegions:
			inputs.settlementRegions ?? new Int32Array(state.P).fill(-1),
		settlementWaterLandmarks:
			inputs.settlementWaterLandmarks ?? new Int32Array(state.P).fill(-1),
		settlementPortRegions:
			inputs.settlementPortRegions ?? new Int32Array(state.P).fill(-1),
		planetRadiusKm: world.params.planetRadiusKm,
		landPassable,
		provinceClusters,
		groupIds: LAND_ELIGIBILITY.computeGroupIds({
			state,
			landPassable,
			provinceClusters,
		}),
		waterDepthPenalty: SEA_ROUTES.computeWaterDepthPenalty(state),
		workspace: createSearchWorkspace(state.regionProvince.length),
		neighborWorkspace: SEA_ROUTES.createSeaNeighborWorkspace(
			state.regionProvince.length,
		),
		landUsage: new Uint32Array(state.regionAdjList.length),
		landMajorUsage: new Uint32Array(state.regionAdjList.length),
		seaUsage: new Uint32Array(state.regionAdjList.length),
		pairs: Array.from({ length: 3 }, () => ({
			stored: new Map(),
			rejected: new Map(),
			desired: new Map(),
			searched: 0,
			retried: 0,
			neighborMs: 0,
			attempted: 0,
		})),
		batch: 0,
	}
}
function recordUsage({ state, route, delta }: RecordUsageParams): void {
	const sea = route.kind === TRANSPORT.ROUTE_SEA
	const params = {
		adjOffset: state.world.regionAdjOffset,
		adjList: state.world.regionAdjList,
		pathRegions: route.pathRegions,
		firstEdge: sea ? 2 : 1,
		endEdge: route.pathRegions.length - (sea ? 1 : 0),
		delta,
	}
	EDGE_USAGE.recordPath({
		...params,
		counts: sea ? state.seaUsage : state.landUsage,
	})
	if (route.kind === TRANSPORT.ROUTE_LAND_MAJOR)
		EDGE_USAGE.recordPath({ ...params, counts: state.landMajorUsage })
}
function advance({ state, urbanPopulation }: AdvanceRoutesParams): RouteBatch {
	const started = performance.now()
	const world = state.world
	const before = state.pairs.map((work) => new Set(work.stored.keys()))
	const changes = ROUTE_MEMBERSHIP.advance({ state, urbanPopulation })
	const landStart = performance.now()
	const landCandidates = LAND_ROUTES.collectLandCandidatesByKind({
		state: world,
		settlementRegions: state.settlementRegions,
		provinceClusters: state.provinceClusters,
		urbanPopulation,
		membership: state.membership,
	})
	const added: Route[] = []
	const released: Route[] = []
	const blockedPairs = new Set<number>()
	for (const work of state.pairs) {
		work.searched = 0
		work.retried = 0
		work.neighborMs = 0
		work.attempted = 0
		const affected =
			work === state.pairs[TRANSPORT.ROUTE_SEA] ? changes.sea : changes.land
		for (const key of affected) work.desired.delete(key)
	}
	for (const kind of [TRANSPORT.ROUTE_LAND_MAJOR, TRANSPORT.ROUTE_LAND_MINOR]) {
		const begin = added.length
		LAND_ROUTES.appendLandRoutes({
			state: world,
			kind,
			candidateGroups:
				kind === TRANSPORT.ROUTE_LAND_MAJOR
					? landCandidates.major.filter((group) =>
							changes.land.has(
								group.landmark * Math.max(1, world.P) + group.cluster,
							),
						)
					: landCandidates.minor.filter((group) =>
							changes.land.has(
								group.landmark * Math.max(1, world.P) + group.cluster,
							),
						),
			groupIds: state.groupIds,
			workspace: state.workspace,
			landUsage: state.landUsage,
			planetRadiusKm: state.planetRadiusKm,
			provincePairSpan: world.P,
			blockedPairs,
			routes: added,
			work: state.pairs[kind],
			centers: state.centers,
		})
		for (const route of added.slice(begin)) {
			const key = PATHFIND.pairKey({
				a: route.fromProvince,
				b: route.toProvince,
				span: world.P,
			})
			state.pairs[kind].stored.set(key, route)
			if (kind === TRANSPORT.ROUTE_LAND_MAJOR) {
				EDGE_USAGE.recordPath({
					adjOffset: world.regionAdjOffset,
					adjList: world.regionAdjList,
					counts: state.landMajorUsage,
					pathRegions: route.pathRegions,
					firstEdge: 1,
					endEdge: route.pathRegions.length,
					delta: 1,
				})
			}
		}
		if (kind === TRANSPORT.ROUTE_LAND_MAJOR) {
			const desired = new Set(
				[...state.pairs[kind].desired.values()].flatMap((set) => [...set]),
			)
			for (const key of state.pairs[kind].stored.keys())
				if (desired.has(key)) blockedPairs.add(key)
		}
	}
	const landMs = performance.now() - landStart
	const seaStart = performance.now()
	const begin = added.length
	SEA_ROUTES.appendSeaRoutes({
		state: world,
		candidateGroups: SEA_ROUTES.collectSeaCandidates({
			state: world,
			settlementRegions: state.settlementRegions,
			settlementWaterLandmarks: state.settlementWaterLandmarks,
			settlementPortRegions: state.settlementPortRegions,
			urbanPopulation,
			membership: state.membership[2],
		}).filter((group) => changes.sea.has(group.waterLandmark)),
		waterDepthPenalty: state.waterDepthPenalty,
		workspace: state.workspace,
		neighborWorkspace: state.neighborWorkspace,
		seaUsage: state.seaUsage,
		urbanPopulation,
		planetRadiusKm: state.planetRadiusKm,
		routes: added,
		work: state.pairs[TRANSPORT.ROUTE_SEA],
	})
	for (const route of added.slice(begin))
		state.pairs[route.kind].stored.set(
			PATHFIND.pairKey({
				a: route.fromProvince,
				b: route.toProvince,
				span: world.P,
			}),
			route,
		)
	for (const work of state.pairs) {
		const desired = new Set(
			[...work.desired.values()].flatMap((set) => [...set]),
		)
		for (const [key, route] of work.stored)
			if (!desired.has(key)) {
				recordUsage({ state, route, delta: -1 })
				work.stored.delete(key)
				released.push(route)
			}
		for (const key of work.rejected.keys())
			if (!desired.has(key)) work.rejected.delete(key)
	}
	const seaMs = performance.now() - seaStart
	const transitions = Array.from({ length: 4 }, () => Array<number>(4).fill(0))
	const keys = new Set([
		...before[0],
		...before[1],
		...state.pairs[0].stored.keys(),
		...state.pairs[1].stored.keys(),
	])
	for (const key of keys) {
		const from = before[0].has(key) ? 2 : before[1].has(key) ? 1 : 0
		const to = state.pairs[0].stored.has(key)
			? 2
			: state.pairs[1].stored.has(key)
				? 1
				: 0
		if (from !== to) transitions[from][to]++
	}
	for (const key of before[2])
		if (!state.pairs[2].stored.has(key)) transitions[3][0]++
	for (const key of state.pairs[2].stored.keys())
		if (!before[2].has(key)) transitions[0][3]++
	state.batch++
	const result: RouteBatch = {
		added,
		released,
		searched: state.pairs.reduce((n, w) => n + w.searched, 0),
		rejected: state.pairs.reduce((n, w) => n + w.attempted, 0) - added.length,
		retried: state.pairs.reduce((n, w) => n + w.retried, 0),
		neighborMs: state.pairs[TRANSPORT.ROUTE_SEA].neighborMs,
		ms: performance.now() - started,
		membershipChanges: changes.count,
		transitions,
		promoted: transitions[1][2],
		demoted: transitions[2][1],
		landMs,
		seaMs,
	}
	state.batches.push({
		...result,
		added: result.added.length,
		pathRegions: result.added.reduce(
			(n, route) => n + route.pathRegions.length,
			0,
		),
		released: result.released.length,
	})
	return result
}
function stored(state: RouteState): Route[] {
	return [
		TRANSPORT.ROUTE_LAND_MAJOR,
		TRANSPORT.ROUTE_LAND_MINOR,
		TRANSPORT.ROUTE_SEA,
	].flatMap((kind) => [...state.pairs[kind].stored.values()])
}
function computeRoutes(params: CreateRouteStateParams): RouteComputation {
	const state = createState(params)
	const batch = advance({
		state,
		urbanPopulation: params.inputs.urbanPopulation,
	})
	TIMING.append({
		stage: "computeRoutes:appendLandRoutes",
		timings: params.inputs.timings,
		ms: batch.landMs,
		children: [],
	})
	TIMING.append({
		stage: "computeRoutes:appendSeaRoutes",
		timings: params.inputs.timings,
		ms: batch.seaMs,
		children: [],
	})
	const routes = stored(state)
	return {
		routes,
		network: ROUTE_EDGES.network({
			routes,
			state: state.world,
			urbanPopulation: params.inputs.urbanPopulation,
		}),
	}
}
export const ROUTES = {
	computeRoutes,
	createState,
	advance,
	stored,
	network: ROUTE_EDGES.network,
}
