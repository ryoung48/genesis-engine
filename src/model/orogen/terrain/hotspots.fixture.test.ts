import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline hotspot output", () => {
	it("producesHotspotArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.volcanism.hotspot.length).toBe(world.mesh.numRegions)
		expect(world.volcanism.mantleUpwelling.length).toBe(world.mesh.numRegions)
	})

	it("producesHotspotValuesInUnitRange", () => {
		const world = getCachedWorld()
		const { hotspot } = world.volcanism
		for (let r = 0; r < hotspot.length; r++) {
			expect(hotspot[r]).toBeGreaterThanOrEqual(0)
			expect(hotspot[r]).toBeLessThanOrEqual(1)
		}
	})

	it("producesAtLeastOneNonZeroHotspot", () => {
		const world = getCachedWorld()
		const { hotspot } = world.volcanism
		let found = false
		for (let r = 0; r < hotspot.length; r++) {
			if (hotspot[r] > 0) {
				found = true
				break
			}
		}
		expect(found).toBe(true)
	})

	it("produces signed mantle upwelling in the current pipeline", () => {
		const world = getCachedWorld()
		const { mantleUpwelling } = world.volcanism
		let positive = 0
		let negative = 0
		for (let r = 0; r < mantleUpwelling.length; r++) {
			if (mantleUpwelling[r] > 0) positive++
			if (mantleUpwelling[r] < 0) negative++
		}
		expect(positive).toBeGreaterThan(0)
		expect(negative).toBeGreaterThan(0)
	})

	it("concentrates more hotspot uplift in the strongest mantle upwelling cells", () => {
		const world = getCachedWorld()
		const hotspotPairs: Array<{ hotspot: number; mantle: number }> = []
		for (let r = 0; r < world.mesh.numRegions; r++) {
			hotspotPairs.push({
				hotspot: world.volcanism.hotspot[r],
				mantle: world.volcanism.mantleUpwelling[r],
			})
		}
		hotspotPairs.sort((a, b) => a.mantle - b.mantle)

		const bucketSize = Math.max(1, Math.floor(hotspotPairs.length * 0.1))
		let bottomMean = 0
		let topMean = 0
		for (let i = 0; i < bucketSize; i++) {
			bottomMean += hotspotPairs[i].hotspot
			topMean += hotspotPairs[hotspotPairs.length - 1 - i].hotspot
		}
		bottomMean /= bucketSize
		topMean /= bucketSize

		expect(topMean).toBeGreaterThan(bottomMean)
	})
})
