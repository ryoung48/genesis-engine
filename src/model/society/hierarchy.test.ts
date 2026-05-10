import { describe, expect, it } from "vitest"
import {
	buildChildrenCSR,
	buildSovereign,
	computeGravity,
	DUCHY_FANOUT,
	EMPIRE_FANOUT,
	HEGEMON_FANOUT,
	KINGDOM_FANOUT,
	rebalanceHierarchy,
} from "./hierarchy"

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
	it("aggregates child tribute without overextension when within fanout range", () => {
		const gravity = computeGravity({
			habitability: new Float32Array([1, 1, 1, 1, 1, 1]),
			childOffset: new Int32Array([0, 5, 5, 5, 5, 5, 5]),
			childList: new Int32Array([1, 2, 3, 4, 5]),
			depth: new Int32Array([0, 1, 1, 1, 1, 1]),
			provinceCount: 6,
			fanoutRanges: HEGEMON_FANOUT,
		})

		expect(Array.from(gravity.slice(1))).toEqual([1, 1, 1, 1, 1])
		// 5 children <= HEGEMON_FANOUT[0][1]=8, so no overextension penalty
		expect(gravity[0]).toBeCloseTo(1 + 5 * 0.25, 6)
	})

	it("applies overextension penalty when direct children exceed the depth's max fanout", () => {
		// fanoutRanges with max=4 at depth 0; province 0 has 5 children → overextended
		const gravity = computeGravity({
			habitability: new Float32Array([1, 1, 1, 1, 1, 1]),
			childOffset: new Int32Array([0, 5, 5, 5, 5, 5, 5]),
			childList: new Int32Array([1, 2, 3, 4, 5]),
			depth: new Int32Array([0, 1, 1, 1, 1, 1]),
			provinceCount: 6,
			fanoutRanges: [[1, 4, 2]],
		})

		expect(gravity[0]).toBeCloseTo((1 + 5 * 0.25) * 0.9, 6)
	})

	it("nodes beyond fanout depth (flat level) are never overextended", () => {
		// DUCHY_FANOUT=[] means depth 0 is the flat level; no overextension regardless of children
		const gravity = computeGravity({
			habitability: new Float32Array([1, 1, 1, 1, 1, 1]),
			childOffset: new Int32Array([0, 5, 5, 5, 5, 5, 5]),
			childList: new Int32Array([1, 2, 3, 4, 5]),
			depth: new Int32Array([0, 1, 1, 1, 1, 1]),
			provinceCount: 6,
			fanoutRanges: DUCHY_FANOUT,
		})

		expect(gravity[0]).toBeCloseTo(1 + 5 * 0.25, 6)
	})
})

describe("rebalanceHierarchy", () => {
	it("flat-assigns all members directly to capital for duchy-tier nations", () => {
		const parent = new Int32Array(5).fill(-1)
		const depth = new Int32Array(5)

		rebalanceHierarchy({
			capital: 0,
			members: new Int32Array([1, 2, 3, 4]),
			parent,
			depth,
			currentDepth: 0,
			fanoutRanges: DUCHY_FANOUT,
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

		// All members are direct children of capital (flat duchy)
		for (const province of [1, 2, 3, 4]) {
			expect(parent[province]).toBe(0)
			expect(depth[province]).toBe(1)
		}
	})

	it("splits into duchy groups at depth 0 for kingdom-tier nations", () => {
		// 15 members → KINGDOM_FANOUT [[2,6,4]]: k = clamp(round(15/4),2,6) = clamp(4,2,6) = 4
		// Depth 1 onwards is flat (duchy level)
		const provinceCount = 16
		const members = Int32Array.from({ length: 15 }, (_, i) => i + 1)
		const parent = new Int32Array(provinceCount).fill(-1)
		const depth = new Int32Array(provinceCount)
		const angle = (i: number) => (2 * Math.PI * i) / provinceCount
		const r_xyz = new Float32Array(provinceCount * 3)
		for (let i = 0; i < provinceCount; i++) {
			r_xyz[3 * i] = Math.cos(angle(i))
			r_xyz[3 * i + 1] = Math.sin(angle(i))
		}
		const adjOffset = new Int32Array(provinceCount + 1)
		const adjList = new Int32Array(provinceCount * 2)
		for (let i = 0; i < provinceCount; i++) {
			adjOffset[i] = i * 2
			adjList[i * 2] = (i - 1 + provinceCount) % provinceCount
			adjList[i * 2 + 1] = (i + 1) % provinceCount
		}
		adjOffset[provinceCount] = provinceCount * 2

		rebalanceHierarchy({
			capital: 0,
			members,
			parent,
			depth,
			currentDepth: 0,
			fanoutRanges: KINGDOM_FANOUT,
			habitability: new Float32Array(provinceCount).fill(1),
			urbanPop: new Float32Array(provinceCount),
			provinceSeeds: Int32Array.from({ length: provinceCount }, (_, i) => i),
			r_xyz,
			adjOffset,
			adjList,
			provinceCount,
		})

		const directChildren = members.filter((p) => parent[p] === 0).length
		expect(directChildren).toBeGreaterThanOrEqual(2)
		expect(directChildren).toBeLessThanOrEqual(6)
		// All other members are counties at depth 2 under duchy capitals
		for (const p of members) {
			expect(parent[p]).toBeGreaterThanOrEqual(0)
			expect(depth[p]).toBeGreaterThanOrEqual(1)
		}
		const duchyCapitals = members.filter((p) => parent[p] === 0)
		for (const duchy of duchyCapitals) {
			expect(depth[duchy]).toBe(1)
		}
		const counties = members.filter((p) => parent[p] !== 0)
		for (const county of counties) {
			expect(depth[county]).toBe(2)
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
			fanoutRanges: DUCHY_FANOUT,
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
			fanoutRanges: DUCHY_FANOUT,
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
			fanoutRanges: DUCHY_FANOUT,
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
			fanoutRanges: KINGDOM_FANOUT,
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

	it("EMPIRE_FANOUT produces three-tier structure: empire → kingdom → duchy → counties", () => {
		// 50 members; EMPIRE_FANOUT=[[3,8,15],[2,6,4]]
		// depth 0: k = clamp(round(49/15),3,8) = clamp(3,3,8) = 3 kingdoms
		// depth 1: duchy splits, then flat counties
		const provinceCount = 51
		const members = Int32Array.from({ length: 50 }, (_, i) => i + 1)
		const parent = new Int32Array(provinceCount).fill(-1)
		const depth = new Int32Array(provinceCount)
		const r_xyz = new Float32Array(provinceCount * 3)
		for (let i = 0; i < provinceCount; i++) {
			const angle = (2 * Math.PI * i) / provinceCount
			r_xyz[3 * i] = Math.cos(angle)
			r_xyz[3 * i + 1] = Math.sin(angle)
		}
		const adjOffset = new Int32Array(provinceCount + 1)
		const adjList = new Int32Array(provinceCount * 2)
		for (let i = 0; i < provinceCount; i++) {
			adjOffset[i] = i * 2
			adjList[i * 2] = (i - 1 + provinceCount) % provinceCount
			adjList[i * 2 + 1] = (i + 1) % provinceCount
		}
		adjOffset[provinceCount] = provinceCount * 2

		rebalanceHierarchy({
			capital: 0,
			members,
			parent,
			depth,
			currentDepth: 0,
			fanoutRanges: EMPIRE_FANOUT,
			habitability: new Float32Array(provinceCount).fill(1),
			urbanPop: new Float32Array(provinceCount),
			provinceSeeds: Int32Array.from({ length: provinceCount }, (_, i) => i),
			r_xyz,
			adjOffset,
			adjList,
			provinceCount,
		})

		// depth 1 = kingdom capitals (direct children of empire capital)
		const kingdomCapitals = members.filter((p) => depth[p] === 1)
		expect(kingdomCapitals.length).toBeGreaterThanOrEqual(3)
		expect(kingdomCapitals.length).toBeLessThanOrEqual(8)
		// depth 2 = duchy capitals
		const duchyCapitals = members.filter((p) => depth[p] === 2)
		expect(duchyCapitals.length).toBeGreaterThan(0)
		// depth 3 = flat counties
		const counties = members.filter((p) => depth[p] === 3)
		expect(counties.length).toBeGreaterThan(0)
		// all assigned
		for (const p of members) {
			expect(parent[p]).toBeGreaterThanOrEqual(0)
		}
	})
})
