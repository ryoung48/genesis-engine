import { describe, expect, it } from "vitest"
import { BUCKET_QUEUE } from "@/model/shared/bucket-queue"
import { ROUTE_TUNING } from "@/model/society/infrastructure/trade/routing/route-tuning"
import { ROUTE_SEARCH } from "@/model/society/infrastructure/trade/routing/search"
import type { FindPathParams } from "@/model/society/infrastructure/trade/routing/search/types"
import type { SearchWorkspace } from "@/model/society/infrastructure/trade/routing/types"

function createWorkspace(size: number): SearchWorkspace {
	const distance = new Float32Array(size)
	return {
		distance,
		prev: new Int32Array(size),
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

function createRequest(): FindPathParams {
	return {
		state: {
			P: 5,
			era: "lateMedieval",
			desolate: new Uint8Array(5),
			stateless: new Uint8Array(5),
			regionProvince: new Int32Array([0, 1, 2, 3, 4]),
			regionAdjOffset: new Int32Array([0, 2, 4, 6, 8, 10]),
			regionAdjList: new Int32Array([1, 2, 0, 4, 0, 3, 2, 4, 1, 3]),
			regionIsLand: new Uint8Array(5).fill(1),
			r_xyz: new Float32Array(15),
			landmarks: {
				regionLandmark: new Int32Array(5),
				type: new Uint8Array(1),
				size: new Int32Array([5]),
				count: 1,
			},
		},
		workspace: createWorkspace(5),
		startRegion: 0,
		endRegion: 4,
		groupId: 0,
		groupIds: new Float64Array(5),
		edgeUsed: new Uint32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 1]),
		waterDepthPenalty: null,
		kind: "land",
	}
}

describe("bidirectional route search", () => {
	it("continues past the first frontier intersection to find the cheaper road", () => {
		expect(ROUTE_SEARCH.findPath(createRequest())).toEqual([0, 2, 3, 4])
	})

	it("reuses both frontiers in reverse and resets stamps on rollover", () => {
		const request = createRequest()
		expect(ROUTE_SEARCH.findPath(request)).toEqual([0, 2, 3, 4])
		expect(
			ROUTE_SEARCH.findPath({ ...request, startRegion: 4, endRegion: 0 }),
		).toEqual([4, 3, 2, 0])
		request.workspace.stamp = 0x7ffffffe
		expect(ROUTE_SEARCH.findPath(request)).toEqual([0, 2, 3, 4])
		expect(request.workspace.stamp).toBe(1)
	})

	it("handles identical endpoints, disconnected groups and invalid endpoints", () => {
		const request = createRequest()
		expect(ROUTE_SEARCH.findPath({ ...request, endRegion: 0 })).toEqual([0])
		request.groupIds[1] = -1
		request.groupIds[2] = -1
		expect(ROUTE_SEARCH.findPath(request)).toEqual([])
		expect(ROUTE_SEARCH.findPath({ ...request, startRegion: -1 })).toEqual([])
		request.groupIds[4] = -1
		expect(ROUTE_SEARCH.findPath(request)).toEqual([])
	})

	it("uses symmetric sea-depth penalties in both directions", () => {
		const request = createRequest()
		request.state.regionIsLand.fill(0)
		const seaRequest: FindPathParams = {
			...request,
			kind: "sea",
			groupIds: null,
			waterDepthPenalty: new Float32Array([0, 10, 0, 0, 0]),
		}
		expect(ROUTE_SEARCH.findPath(seaRequest)).toEqual([0, 2, 3, 4])
		expect(
			ROUTE_SEARCH.findPath({ ...seaRequest, startRegion: 4, endRegion: 0 }),
		).toEqual([4, 3, 2, 0])
	})
})
