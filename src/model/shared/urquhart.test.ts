import { describe, expect, it } from "vitest"
import { buildUrquhartEdges, buildUrquhartEdgesFromFlat } from "./urquhart"

describe("buildUrquhartEdges", () => {
	it("connects two points directly", () => {
		expect(
			buildUrquhartEdges([
				[0, 0],
				[1, 0],
			]),
		).toEqual([[0, 1]])
	})

	it("drops the longest edge from a triangle", () => {
		const edges = buildUrquhartEdges([
			[0, 0],
			[2, 0],
			[0, 1],
		])

		expect(edges.sort()).toEqual([
			[0, 1],
			[0, 2],
		])
	})

	it("matches tuple and flat coordinate inputs", () => {
		const tupleEdges = buildUrquhartEdges([
			[0, 0],
			[2, 0],
			[0, 1],
			[2, 1],
		]).sort()
		const flatEdges = buildUrquhartEdgesFromFlat(
			new Float64Array([0, 0, 2, 0, 0, 1, 2, 1]),
		).sort()

		expect(flatEdges).toEqual(tupleEdges)
	})
})
