import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline province output", () => {
	it("assignsSentinelToOceanCells", () => {
		const world = getCachedWorld()
		const { regionProvince } = world.provinces!
		const isLand = world.isLand!
		for (let r = 0; r < isLand.length; r++) {
			if (!isLand[r]) expect(regionProvince[r]).toBe(-1)
		}
	})

	it("assignsValidProvinceIndexToLandCells", () => {
		const world = getCachedWorld()
		const { regionProvince, count } = world.provinces!
		const isLand = world.isLand!
		for (let r = 0; r < isLand.length; r++) {
			if (isLand[r]) {
				expect(regionProvince[r]).toBeGreaterThanOrEqual(0)
				expect(regionProvince[r]).toBeLessThan(count)
			}
		}
	})

	it("producesSymmetricProvinceAdjacency", () => {
		const world = getCachedWorld()
		const { adjOffset, adjList, count } = world.provinces!
		for (let p = 0; p < count; p++) {
			for (let j = adjOffset[p]; j < adjOffset[p + 1]; j++) {
				const nb = adjList[j]
				let reciprocated = false
				for (let k = adjOffset[nb]; k < adjOffset[nb + 1]; k++) {
					if (adjList[k] === p) {
						reciprocated = true
						break
					}
				}
				expect(reciprocated).toBe(true)
			}
		}
	})

	it("producesAdjOffsetLengthOfCountPlusOne", () => {
		const world = getCachedWorld()
		const { adjOffset, count } = world.provinces!
		expect(adjOffset.length).toBe(count + 1)
	})

	it("producesThreeColorComponentsPerProvince", () => {
		const world = getCachedWorld()
		const { colors, count } = world.provinces!
		expect(colors.length).toBe(count * 3)
	})

	it("producesPositiveSizeForNonDesolateProvince", () => {
		const world = getCachedWorld()
		const { size, desolate, count } = world.provinces!
		for (let p = 0; p < count; p++) {
			if (!desolate[p]) expect(size[p]).toBeGreaterThan(0)
		}
	})

	it("producesLandmassIdSentinelForDesolateProvince", () => {
		const world = getCachedWorld()
		const { landmassId, desolate, count } = world.provinces!
		for (let p = 0; p < count; p++) {
			if (desolate[p]) expect(landmassId[p]).toBe(-1)
		}
	})
})
