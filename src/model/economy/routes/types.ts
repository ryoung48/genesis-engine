import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
import type { MinHeap } from "@/model/shared/min-heap"
import type {
	GenesisNationHierarchy,
	GenesisProvinces,
	SocietyEra,
} from "@/model/society/types"
import type { GenesisLandmarks } from "@/model/terrain/landmarks/types"
import type { Route, RouteEdge } from "@/model/transport/types"

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
	/** Province count. */
	P: number
	era: SocietyEra
	desolate: Uint8Array
	/** Settled but nation-less provinces, impassable to routes. */
	stateless: Uint8Array
	regionProvince: Int32Array
	regionAdjOffset: Int32Array
	regionAdjList: Int32Array
	regionIsLand: Uint8Array
	r_xyz: Float32Array
	landmarks: GenesisLandmarks
}

export interface RouteInputs {
	/**
	 * Per-province urban population, sizing settlements into major/minor/port
	 * route candidates. Supplied by the urbanization pipeline stage; this used
	 * to be read out of the sim's population timelines.
	 */
	urbanPopulation: Float32Array
	settlementRegions?: Int32Array
	settlementWaterLandmarks?: Int32Array
	settlementPortRegions?: Int32Array
	timings?: Array<{ Stage: string; ms: string }>
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
	targetStamp: Int32Array
	targetCount: Int32Array
	heap: MinHeap
	stamp: number
}

export interface SeaNeighborWorkspace {
	distance: Float32Array
	owner: Int32Array
	queued: Int32Array
	settled: Int32Array
	heap: MinHeap
	stamp: number
}
