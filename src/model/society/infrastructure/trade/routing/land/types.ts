import type {
	LandCandidateGroup,
	RouteCandidate,
	RoutePairWork,
	RouteWorld,
	SearchWorkspace,
} from "@/model/society/infrastructure/trade/routing/types"
import type {
	Route,
	SerializedRouteKind,
} from "@/model/society/infrastructure/transport/types"

export interface AppendLandRoutesParams {
	state: RouteWorld
	kind: SerializedRouteKind
	candidateGroups: LandCandidateGroup[]
	groupIds: Float64Array
	workspace: SearchWorkspace
	landUsage: Uint32Array
	planetRadiusKm: number | undefined
	provincePairSpan: number
	blockedPairs: Set<number>
	routes: Route[]
	work: RoutePairWork
	centers: Map<number, readonly [number, number, number]>
}

export interface ProvinceLandClustersParams {
	state: RouteWorld
	landPassable: Uint8Array
}

export interface LandCandidatesParams {
	state: RouteWorld
	settlementRegions: Int32Array
	provinceClusters: Int32Array
	urbanPopulation: Float32Array
	membership: Uint8Array[] | null
}

export interface PushLandCandidateParams {
	groups: Map<number, LandCandidateGroup>
	groupKey: number
	cluster: number
	landmark: number
	candidate: RouteCandidate
}
