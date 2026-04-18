import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"
import { PASTA_LABELS } from "./pasta"

describe("pipeline pasta climate output", () => {
	it("producesPastaClimateArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.pastaClimate.length).toBe(world.mesh.numRegions)
	})

	it("producesPastaCodesInValidRange", () => {
		const world = getCachedWorld()
		const { pastaClimate } = world
		for (let r = 0; r < pastaClimate.length; r++) {
			expect(pastaClimate[r]).toBeGreaterThanOrEqual(0)
			expect(pastaClimate[r]).toBeLessThan(PASTA_LABELS.length)
		}
	})

	it("producesAllPastaCodesInValidRange", () => {
		const world = getCachedWorld()
		const { pastaClimate } = world
		for (let r = 0; r < pastaClimate.length; r++) {
			expect(pastaClimate[r]).toBeGreaterThanOrEqual(0)
			expect(pastaClimate[r]).toBeLessThan(PASTA_LABELS.length)
		}
	})

	it("assignsNonOceanCodeToAtLeastOneLandCell", () => {
		const world = getCachedWorld()
		const { pastaClimate, isLand } = world
		let found = false
		for (let r = 0; r < pastaClimate.length; r++) {
			if (isLand[r] && pastaClimate[r] > 0) {
				found = true
				break
			}
		}
		expect(found).toBe(true)
	})
})
