import type {
	RoutePairWork,
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
	work: RoutePairWork
}

export interface SeaCandidatesParams {
	state: RouteWorld
	settlementRegions: Int32Array
	settlementWaterLandmarks: Int32Array
	settlementPortRegions: Int32Array
	urbanPopulation: Float32Array
	membership: Uint8Array | null
}

export interface SeaRouteLimitParams {
	state: RouteWorld
	sourcePopulation: number
	targetPopulation: number
}

export interface SeaNeighborPairsParams {
	state: RouteWorld
	waterLandmark: number
	candidates: SeaCandidateGroup["candidates"]
	waterDepthPenalty: Float32Array
	workspace: SeaNeighborWorkspace
}
