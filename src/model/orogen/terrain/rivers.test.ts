import { describe, expect, it } from "vitest"
import { selectConnectedLakeCells } from "./rivers"

describe("selectConnectedLakeCells", () => {
	it("trims narrow lake corridors from basin selections", () => {
		const numRegions = 7
		const adjOffset = new Int32Array([0, 3, 6, 9, 13, 15, 17, 18])
		const adjList = new Int32Array([
			1, 2, 3, 0, 2, 3, 0, 1, 3, 0, 1, 2, 4, 3, 5, 4, 6, 5,
		])
		const elevation = new Float32Array([0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3])

		const result = selectConnectedLakeCells(
			numRegions,
			adjOffset,
			adjList,
			elevation,
			[0, 1, 2, 3, 4, 5, 6],
			7,
		)

		expect(result.lakeCells.sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
		expect(result.lakeSurface).toBeCloseTo(0.15, 5)
	})
})
