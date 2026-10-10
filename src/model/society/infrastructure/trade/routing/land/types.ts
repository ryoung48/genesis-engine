import type {
	LandCandidateGroup,
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
}
