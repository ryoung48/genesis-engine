import type { BucketQueue } from "@/model/shared/bucket-queue/types"
import type {
	RouteWorld,
	SearchWorkspace,
} from "@/model/society/infrastructure/trade/routing/types"

interface SearchParams {
	state: RouteWorld
	workspace: SearchWorkspace
	startRegion: number
	endRegion: number
	groupId: number
	edgeUsed: Uint32Array
}

export type FindPathParams = SearchParams &
	(
		| {
				kind: "land"
				groupIds: Float64Array
				waterDepthPenalty: null
		  }
		| {
				kind: "sea"
				groupIds: null
				waterDepthPenalty: Float32Array
		  }
	)

export interface BackwardWorkspace {
	distance: Float32Array
	prev: Int32Array
	queued: Int32Array
	settled: Int32Array
	landQueue: BucketQueue
	seaQueue: BucketQueue
}

export interface NextNodeParams {
	queue: BucketQueue
	settled: Int32Array
}
