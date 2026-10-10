import { describe, expect, it } from "vitest"
import { EDGE_USAGE } from "@/model/society/infrastructure/trade/routing/edge-usage"

const adjOffset = new Int32Array([0, 1, 3, 5, 6])
const adjList = new Int32Array([1, 0, 2, 1, 3, 2])

describe("route adjacency-slot usage", () => {
	it("counts both directions and shared edges across land routes", () => {
		const counts = new Uint32Array(adjList.length)
		EDGE_USAGE.recordPath({
			delta: 1,
			adjOffset,
			adjList,
			counts,
			pathRegions: [0, 1, 2],
			firstEdge: 1,
			endEdge: 3,
		})
		EDGE_USAGE.recordPath({
			delta: 1,
			adjOffset,
			adjList,
			counts,
			pathRegions: [1, 0],
			firstEdge: 1,
			endEdge: 2,
		})
		expect(Array.from(counts)).toEqual([2, 2, 1, 1, 0, 0])
	})

	it("counts sea water edges while excluding both anchor connections", () => {
		const counts = new Uint32Array(adjList.length)
		EDGE_USAGE.recordPath({
			delta: 1,
			adjOffset,
			adjList,
			counts,
			pathRegions: [0, 1, 2, 3],
			firstEdge: 2,
			endEdge: 3,
		})
		expect(Array.from(counts)).toEqual([0, 0, 1, 1, 0, 0])
	})
})
