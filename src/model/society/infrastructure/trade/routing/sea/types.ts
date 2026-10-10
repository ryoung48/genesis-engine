import type {
	RouteWorld,
	SeaCandidateGroup,
	SeaNeighborWorkspace,
	SearchWorkspace,
} from "@/model/society/infrastructure/trade/routing/types"
import type { Route } from "@/model/society/infrastructure/transport/types"

export interface AppendSeaRoutesParams {
	state: RouteWorld
	candidateGroups: SeaCandidateGroup[]
	waterDepthPenalty: Float32Array
	workspace: SearchWorkspace
	neighborWorkspace: SeaNeighborWorkspace
	seaUsage: Uint32Array
	urbanPopulation: Float32Array
	planetRadiusKm: number | undefined
	routes: Route[]
}
