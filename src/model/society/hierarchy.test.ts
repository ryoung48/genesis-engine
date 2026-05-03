import { describe, expect, it } from "vitest"
import {
	buildChildrenCSR,
	buildSovereign,
	computeGravity,
	domainLimitFn,
	rebalanceHierarchy,
} from "./hierarchy"

describe("domainLimitFn", () => {
	it("steps through the configured domain thresholds", () => {
		expect(domainLimitFn(1)).toBe(2)
		expect(domainLimitFn(4)).toBe(3)
		expect(domainLimitFn(7)).toBe(4)
		expect(domainLimitFn(20)).toBe(6)
		expect(domainLimitFn(100)).toBe(10)
	})
})

describe("buildChildrenCSR", () => {
	it("builds child offsets and a flattened child list from parent pointers", () => {
		const result = buildChildrenCSR(new Int32Array([-1, 0, 0, 2]), 4)

		expect(Array.from(result.childOffset)).toEqual([0, 2, 2, 3, 3])
		expect(Array.from(result.childList)).toEqual([1, 2, 3])
	})
})

describe("buildSovereign", () => {
	it("resolves each province to its root sovereign", () => {
		const sovereign = buildSovereign(new Int32Array([-1, 0, 1, -1, 3]), 5)

		expect(Array.from(sovereign)).toEqual([0, 0, 0, 3, 3])
	})
})

describe("computeGravity", () => {
	it("aggregates child tribute and applies overextension penalties", () => {
		const gravity = computeGravity({
			habitability: new Float32Array([1, 1, 1, 1, 1, 1]),
			childOffset: new Int32Array([0, 5, 5, 5, 5, 5, 5]),
			childList: new Int32Array([1, 2, 3, 4, 5]),
			depth: new Int32Array([0, 1, 1, 1, 1, 1]),
			provinceCount: 6,
		})

		expect(Array.from(gravity.slice(1))).toEqual([1, 1, 1, 1, 1])
		expect(gravity[0]).toBeCloseTo((1 + 5 * 0.25) * 0.9, 6)
	})
})

describe("rebalanceHierarchy", () => {
	it("assigns members under the capital using the domain-limited seed count", () => {
		const parent = new Int32Array(5).fill(-1)
		const depth = new Int32Array(5)

		rebalanceHierarchy({
			capital: 0,
			members: new Int32Array([1, 2, 3, 4]),
			parent,
			depth,
			currentDepth: 0,
			habitability: new Float32Array([12, 11, 9, 8, 7]),
			urbanPop: new Float32Array([0, 20_000, 10_000, 0, 0]),
			provinceSeeds: new Int32Array([0, 1, 2, 3, 4]),
			r_xyz: new Float32Array([
				1, 0, 0, 0.8, 0.2, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0,
			]),
			adjOffset: new Int32Array([0, 4, 6, 9, 12, 14]),
			adjList: new Int32Array([1, 2, 3, 4, 0, 2, 0, 1, 3, 0, 2, 4, 0, 3]),
			provinceCount: 5,
		})

		const capitalChildren = parent.filter((value) => value === 0).length
		expect(capitalChildren).toBe(3)
		for (const province of [1, 2, 3, 4]) {
			expect(parent[province]).toBeGreaterThanOrEqual(0)
			expect(parent[province]).not.toBe(province)
			expect(depth[province]).toBeGreaterThan(0)
		}
	})

	it("handles empty memberships and disconnected leftovers without dropping provinces", () => {
		const emptyParent = new Int32Array([9, 9])
		const emptyDepth = new Int32Array([4, 4])

		rebalanceHierarchy({
			capital: 0,
			members: new Int32Array(),
			parent: emptyParent,
			depth: emptyDepth,
			currentDepth: 2,
			habitability: new Float32Array([3, 2]),
			urbanPop: new Float32Array([0, 0]),
			provinceSeeds: new Int32Array([0, 1]),
			r_xyz: new Float32Array([1, 0, 0, -1, 0, 0]),
			adjOffset: new Int32Array([0, 0, 0]),
			adjList: new Int32Array(),
			provinceCount: 2,
		})

		expect(Array.from(emptyParent)).toEqual([9, 9])
		expect(Array.from(emptyDepth)).toEqual([4, 4])

		const parent = new Int32Array(4).fill(-1)
		const depth = new Int32Array(4)

		rebalanceHierarchy({
			capital: 0,
			members: new Int32Array([1, 2, 3]),
			parent,
			depth,
			currentDepth: 0,
			habitability: new Float32Array([10, 9, 8, 11]),
			urbanPop: new Float32Array([0, 5000, 0, 0]),
			provinceSeeds: new Int32Array([0, 1, 2, 3]),
			r_xyz: new Float32Array([1, 0, 0, 0.8, 0.2, 0, -0.8, 0.2, 0, 0, -1, 0]),
			adjOffset: new Int32Array([0, 1, 1, 1, 1]),
			adjList: new Int32Array([1]),
			provinceCount: 4,
		})

		expect(parent[1]).toBe(0)
		expect(parent[2]).toBe(0)
		expect(parent[3]).toBe(0)
		expect(depth[1]).toBe(1)
		expect(depth[2]).toBe(1)
		expect(depth[3]).toBe(1)
	})

	it("seeds disconnected leftovers from the most habitable province before recursing", () => {
		const parent = new Int32Array(6).fill(-1)
		const depth = new Int32Array(6)

		rebalanceHierarchy({
			capital: 0,
			members: new Int32Array([1, 2, 3, 4, 5]),
			parent,
			depth,
			currentDepth: 0,
			habitability: new Float32Array([10, 20, 19, 1, 3, 18]),
			urbanPop: new Float32Array([0, 0, 0, 0, 0, 0]),
			provinceSeeds: new Int32Array([0, 1, 2, 3, 4, 5]),
			r_xyz: new Float32Array([
				1, 0, 0, 0.99, 0.1, 0, 0.98, 0.2, 0, 0.96, 0.28, 0, 0.95, 0.3, 0, 0.97,
				0.25, 0,
			]),
			adjOffset: new Int32Array([0, 0, 1, 2, 3, 4, 4]),
			adjList: new Int32Array([2, 1, 4, 3]),
			provinceCount: 6,
		})

		expect(parent[1]).toBeGreaterThanOrEqual(0)
		expect(parent[2]).toBeGreaterThanOrEqual(0)
		expect(parent[5]).toBeGreaterThanOrEqual(0)
		expect(parent[4]).toBe(0)
		expect(parent[3]).toBeGreaterThanOrEqual(0)
		expect(depth[4]).toBe(1)
		expect(depth[3]).toBeGreaterThan(0)
	})

	it("promotes the most habitable leftover province when a detached cluster recurses", () => {
		const parent = new Int32Array(7).fill(-1)
		const depth = new Int32Array(7)

		rebalanceHierarchy({
			capital: 0,
			members: new Int32Array([1, 2, 3, 4, 5, 6]),
			parent,
			depth,
			currentDepth: 0,
			habitability: new Float32Array([10, 20, 18, 16, 14, 0.01, 0.02]),
			urbanPop: new Float32Array([0, 0, 0, 0, 0, 0, 0]),
			provinceSeeds: new Int32Array([0, 1, 2, 3, 4, 5, 6]),
			r_xyz: new Float32Array([
				1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0, 0, 0, 1, 0.1, 0.99, 0, 0.2, 0.98,
				0,
			]),
			adjOffset: new Int32Array([0, 0, 0, 0, 0, 0, 1, 2]),
			adjList: new Int32Array([6, 5]),
			provinceCount: 7,
		})

		expect(parent[1]).toBe(0)
		expect(parent[2]).toBe(0)
		expect(parent[3]).toBe(0)
		expect(parent[4]).toBe(0)
		expect(parent[6]).toBe(0)
		expect(parent[5]).toBe(6)
		expect(depth[6]).toBe(1)
		expect(depth[5]).toBe(2)
	})
})
