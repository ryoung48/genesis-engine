import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline nation output", () => {
	it("producesParentIndexInValidProvinceRangeOrSentinel", () => {
		const world = getCachedWorld()
		const provinceCount = world.provinces!.count
		const { parent } = world.nations!
		for (let p = 0; p < parent.length; p++) {
			expect(parent[p]).toBeGreaterThanOrEqual(-1)
			expect(parent[p]).toBeLessThan(provinceCount)
		}
	})

	it("producesAcyclicParentChain", () => {
		const world = getCachedWorld()
		const { parent } = world.nations!
		for (let p = 0; p < parent.length; p++) {
			let cur = p
			let steps = 0
			while (parent[cur] >= 0) {
				cur = parent[cur]
				steps++
				if (steps > parent.length) break
			}
			expect(steps).toBeLessThanOrEqual(parent.length)
		}
	})

	it("producesSovereignEqualToRootOfParentChain", () => {
		const world = getCachedWorld()
		const { parent, sovereign } = world.nations!
		for (let p = 0; p < parent.length; p++) {
			let root = p
			while (parent[root] >= 0) root = parent[root]
			expect(sovereign[p]).toBe(root)
		}
	})

	it("producesDepthZeroForSovereignProvinces", () => {
		const world = getCachedWorld()
		const { parent, depth } = world.nations!
		for (let p = 0; p < parent.length; p++) {
			if (parent[p] === -1) expect(depth[p]).toBe(0)
		}
	})

	it("producesDepthOneGreaterThanParent", () => {
		const world = getCachedWorld()
		const { parent, depth } = world.nations!
		for (let p = 0; p < parent.length; p++) {
			if (parent[p] >= 0) expect(depth[p]).toBe(depth[parent[p]] + 1)
		}
	})

	it("producesNonNegativeGravityForEveryProvince", () => {
		const world = getCachedWorld()
		const { gravity } = world.nations!
		for (let p = 0; p < gravity.length; p++) {
			expect(gravity[p]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesAdjOffsetLengthOfNationCountPlusOne", () => {
		const world = getCachedWorld()
		const { adjOffset, count } = world.nations!
		expect(adjOffset.length).toBe(count + 1)
	})
})
