import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"
import { KOPPEN_CLASSES } from "./koppen"

describe("pipeline koppen climate output", () => {
	it("producesKoppenClimateArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.koppenClimate.length).toBe(world.mesh.numRegions)
	})

	it("producesKoppenCodesInValidRange", () => {
		const world = getCachedWorld()
		const { koppenClimate } = world
		for (let r = 0; r < koppenClimate.length; r++) {
			expect(koppenClimate[r]).toBeGreaterThanOrEqual(0)
			expect(koppenClimate[r]).toBeLessThan(KOPPEN_CLASSES.length)
		}
	})

	it("assignsOceanCodeToAllOceanCells", () => {
		const world = getCachedWorld()
		const { koppenClimate, isLand } = world
		// Code 0 is "Ocean" in KOPPEN_CLASSES
		for (let r = 0; r < koppenClimate.length; r++) {
			if (!isLand[r]) {
				expect(koppenClimate[r]).toBe(0)
			}
		}
	})

	it("assignsNonOceanCodeToAtLeastOneLandCell", () => {
		const world = getCachedWorld()
		const { koppenClimate, isLand } = world
		let found = false
		for (let r = 0; r < koppenClimate.length; r++) {
			if (isLand[r] && koppenClimate[r] > 0) {
				found = true
				break
			}
		}
		expect(found).toBe(true)
	})
})
