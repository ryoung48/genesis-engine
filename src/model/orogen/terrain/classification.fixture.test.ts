import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"
import { OROGEN_TOPOGRAPHY_LABELS } from "../types"

describe("pipeline classification output", () => {
	it("producesSlopeScoreArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.slopeScore.length).toBe(world.mesh.numRegions)
	})

	it("producesSlopeScoreInUnitRange", () => {
		const world = getCachedWorld()
		const { slopeScore } = world
		for (let r = 0; r < slopeScore.length; r++) {
			expect(slopeScore[r]).toBeGreaterThanOrEqual(0)
			expect(slopeScore[r]).toBeLessThanOrEqual(1)
		}
	})

	it("producesTopographyArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.topography.length).toBe(world.mesh.numRegions)
	})

	it("producesTopographyCodesInValidRange", () => {
		const world = getCachedWorld()
		const { topography } = world
		for (let r = 0; r < topography.length; r++) {
			expect(topography[r]).toBeGreaterThanOrEqual(0)
			expect(topography[r]).toBeLessThan(OROGEN_TOPOGRAPHY_LABELS.length)
		}
	})

	it("producesCoastalArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.coastal.length).toBe(world.mesh.numRegions)
	})

	it("producesCoastalFlagOfZeroOrOne", () => {
		const world = getCachedWorld()
		const { coastal } = world
		for (let r = 0; r < coastal.length; r++) {
			expect(coastal[r] === 0 || coastal[r] === 1).toBe(true)
		}
	})
})
