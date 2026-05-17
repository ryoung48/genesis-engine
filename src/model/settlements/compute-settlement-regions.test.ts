import { describe, expect, it } from "vitest"
import {
	computeSettlementAnchors,
	computeSettlementRegions,
} from "./compute-settlement-regions"

function createWorld() {
	return {
		mesh: {
			numRegions: 8,
			adjOffset: new Int32Array([0, 2, 3, 5, 6, 8, 9, 11, 12]),
			adjList: new Int32Array([1, 4, 0, 3, 4, 2, 0, 2, 6, 5, 7, 6]),
			r_xyz: new Float32Array([
				0, 0, 0, 0.2, 0, 0, 1, 0, 0, 1.2, 0, 0, 1.05, 0, 0, 2, 0, 0, 2.2, 0, 0,
				2.4, 0, 0,
			]),
		},
		provinces: {
			count: 4,
			regionProvince: new Int32Array([0, 0, 1, 1, -1, 2, 2, 3]),
			desolate: new Uint8Array([0, 0, 0, 1]),
			seeds: new Int32Array([1, 3, 6, 7]),
		},
		topography: new Uint8Array([1, 1, 1, 1, 6, 1, 1, 1]),
		coastal: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
		rivers: {
			visible: new Uint8Array([0, 0, 0, 0, 0, 1, 0, 0]),
		},
		isLand: new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1]),
		landmarks: {
			regionLandmark: new Int32Array([0, 0, 2, 2, 1, 3, 3, 3]),
			type: new Uint8Array([0, 3, 0, 0]),
			size: new Int32Array([2, 4, 2, 3]),
		},
	}
}

describe("computeSettlementRegions", () => {
	it("prefers coast, then lake adjacency, then river, then inland with seed tie-break", () => {
		const world = createWorld()

		const result = computeSettlementRegions(world)

		expect(result[0]).toBe(0)
		expect(result[1]).toBe(2)
		expect(result[2]).toBe(5)
	})

	it("returns no anchor for desolate provinces", () => {
		const world = createWorld()

		const result = computeSettlementRegions(world)

		expect(result[3]).toBe(-1)
	})

	it("breaks ties by choosing the candidate closest to the province seed", () => {
		const world = createWorld()
		world.coastal.fill(0)
		world.rivers.visible.fill(0)
		world.topography?.fill(1)

		const result = computeSettlementRegions(world)

		expect(result[0]).toBe(1)
		expect(result[1]).toBe(3)
		expect(result[2]).toBe(6)
	})

	it("assigns coastal ports to the largest adjacent water landmark", () => {
		const world = createWorld()
		world.coastal = new Uint8Array([1, 0, 1, 0, 0, 0, 0, 0])
		world.landmarks = {
			regionLandmark: new Int32Array([0, 0, 2, 2, 1, 3, 3, 3]),
			type: new Uint8Array([0, 3, 0, 3]),
			size: new Int32Array([2, 8, 2, 3]),
		}

		const result = computeSettlementAnchors(world)

		expect(result.settlementRegions[0]).toBe(0)
		expect(result.settlementWaterLandmarks[0]).toBe(1)
		expect(result.settlementPortRegions[0]).toBe(4)
	})
})
