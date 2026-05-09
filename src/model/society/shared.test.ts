import { describe, expect, it } from "vitest"
import { computeGraphPartition, deriveChildColors } from "./shared"

describe("deriveChildColors", () => {
	it("derives child colors within valid range from a parent color", () => {
		const childToParent = new Int32Array([0, 0, 0])
		const parentColors = new Float32Array([0.8, 0.2, 0.1])
		const result = deriveChildColors({
			childCount: 3,
			childToParent,
			parentColors,
			seed: 42,
		})
		expect(result.length).toBe(9)
		for (let i = 0; i < 9; i++) {
			expect(result[i]).toBeGreaterThanOrEqual(0)
			expect(result[i]).toBeLessThanOrEqual(1)
		}
	})

	it("leaves entries at zero for children with a negative parent index", () => {
		const childToParent = new Int32Array([-1, 0])
		const parentColors = new Float32Array([0.5, 0.5, 0.5])
		const result = deriveChildColors({
			childCount: 2,
			childToParent,
			parentColors,
			seed: 7,
		})
		expect(result[0]).toBe(0)
		expect(result[1]).toBe(0)
		expect(result[2]).toBe(0)
	})

	it("spreads hues across multiple siblings of the same parent", () => {
		const childToParent = new Int32Array([0, 0, 0, 0])
		const parentColors = new Float32Array([0.2, 0.7, 0.3])
		const result = deriveChildColors({
			childCount: 4,
			childToParent,
			parentColors,
			seed: 99,
		})
		expect(result.length).toBe(12)
		for (let i = 0; i < 12; i++) {
			expect(result[i]).toBeGreaterThanOrEqual(0)
			expect(result[i]).toBeLessThanOrEqual(1)
		}
	})
})

describe("computeGraphPartition", () => {
	it("returns an empty partition when no nodes are active", () => {
		const result = computeGraphPartition({
			nodeCount: 5,
			adjOffset: new Int32Array(6),
			adjList: new Int32Array(0),
			active: new Uint8Array(5),
			targetCount: 3,
			seed: 42,
		})
		expect(result.count).toBe(0)
		expect(result.assignment).toEqual(new Int32Array(5).fill(-1))
		expect(result.seeds.length).toBe(0)
		expect(result.adjOffset).toEqual(new Int32Array(1))
		expect(result.adjList.length).toBe(0)
	})
})
