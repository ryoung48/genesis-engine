import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
import type { BucketQueue } from "@/model/shared/bucket-queue/types"
import type { StageTiming } from "@/model/shared/timing/types"
import type {
	Route,
	RouteEdge,
} from "@/model/society/infrastructure/transport/types"
import type {
	GenesisNationHierarchy,
	GenesisProvinces,
	SocietyEra,
} from "@/model/society/types"

export interface RouteWorldInput {
	mesh: Pick<SphereMesh, "r_xyz" | "adjOffset" | "adjList">
	params: Pick<GenesisParams, "planetRadiusKm" | "era">
	provinces: Pick<
		GenesisProvinces,
		"count" | "desolate" | "regionProvince" | "adjOffset" | "adjList"
	>
	nations: Pick<GenesisNationHierarchy, "sovereign">
	landmarks: GenesisLandmarks
	isLand: Uint8Array
}

export interface RouteWorld {
	P: number
	era: SocietyEra
	desolate: Uint8Array
	stateless: Uint8Array
	regionProvince: Int32Array
	regionAdjOffset: Int32Array
	regionAdjList: Int32Array
	regionIsLand: Uint8Array
	r_xyz: Float32Array
	landmarks: GenesisLandmarks
}

export interface RouteInputs {
	urbanPopulation: Float32Array
	// [JUSTIFICATION] Imported worlds have no procedural settlements.
	settlementRegions?: Int32Array
	// [JUSTIFICATION] Inland worlds can lack port water bodies.
	settlementWaterLandmarks?: Int32Array
	// [JUSTIFICATION] Worlds without ports have no port anchors.
	settlementPortRegions?: Int32Array
	// [JUSTIFICATION] Timing collection is enabled only by diagnostic callers.
	timings?: StageTiming[]
}

export interface RouteComputation {
	routes: Route[]
	network: RouteEdge[]
}

export interface RouteCandidate {
	province: number
	region: number
}

export interface LandCandidateGroup {
	cluster: number
	landmark: number
	candidates: RouteCandidate[]
}

export interface LandCandidateGroupsByKind {
	major: LandCandidateGroup[]
	minor: LandCandidateGroup[]
}

export interface SeaCandidateGroup {
	waterLandmark: number
	candidates: Array<{
		province: number
		anchorRegion: number
		portRegion: number
	}>
}

export interface SearchWorkspace {
	distance: Float32Array
	prev: Int32Array
	queued: Int32Array
	settled: Int32Array
	landQueue: BucketQueue
	seaQueue: BucketQueue
	stamp: number
}

export interface SeaNeighborWorkspace {
	distance: Float32Array
	owner: Int32Array
	queued: Int32Array
	settled: Int32Array
	queue: BucketQueue
	stamp: number
}

export interface RoutePairWork {
	stored: Map<number, Route>
	rejected: Map<number, number>
	desired: Map<number, Set<number>>
	searched: number
	retried: number
	neighborMs: number
	attempted: number
}
export interface RouteState {
	world: RouteWorld
	settlementRegions: Int32Array
	settlementWaterLandmarks: Int32Array
	settlementPortRegions: Int32Array
	planetRadiusKm: number | undefined
	landPassable: Uint8Array
	provinceClusters: Int32Array
	groupIds: Float64Array
	waterDepthPenalty: Float32Array
	workspace: SearchWorkspace
	neighborWorkspace: SeaNeighborWorkspace
	landUsage: Uint32Array
	landMajorUsage: Uint32Array
	seaUsage: Uint32Array
	pairs: RoutePairWork[]
	batch: number
	membership: Uint8Array[]
	enteredBatch: Int32Array[]
	landGroups: Float64Array
	seaGroups: Int32Array
	longSea: Uint8Array
	batches: RouteBatchSummary[]
	centers: Map<number, readonly [number, number, number]>
}
export interface CreateRouteStateParams {
	world: RouteWorldInput
	inputs: RouteInputs
}
export interface AdvanceRoutesParams {
	state: RouteState
	urbanPopulation: Float32Array
}
export interface RouteBatch {
	added: Route[]
	released: Route[]
	searched: number
	rejected: number
	retried: number
	neighborMs: number
	ms: number
	membershipChanges: number
	transitions: number[][]
	promoted: number
	demoted: number
	landMs: number
	seaMs: number
}

export interface RouteBatchSummary
	extends Omit<RouteBatch, "added" | "released"> {
	added: number
	released: number
	pathRegions: number
}
