import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline hotspot output", () => {
	it("producesHotspotArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.volcanism.hotspot.length).toBe(world.mesh.numRegions)
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
})
