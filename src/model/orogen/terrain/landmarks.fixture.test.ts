import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"
import { LANDMARK_TYPES } from "./landmarks"

describe("pipeline landmarks output", () => {
	it("producesLandmarksObject", () => {
		const world = getCachedWorld()
		expect(world.landmarks).toBeDefined()
	})

	it("producesRegionLandmarkArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.landmarks!.regionLandmark.length).toBe(world.mesh.numRegions)
	})

	it("producesAtLeastOneLandmark", () => {
		const world = getCachedWorld()
		expect(world.landmarks!.count).toBeGreaterThan(0)
	})

	it("assignsRegionLandmarkValuesInValidRange", () => {
		const world = getCachedWorld()
		const { regionLandmark, count } = world.landmarks!
		for (let r = 0; r < regionLandmark.length; r++) {
			expect(regionLandmark[r]).toBeGreaterThanOrEqual(-1)
			expect(regionLandmark[r]).toBeLessThan(count)
		}
	})

	it("producesTypeArrayCoveringAllLandmarks", () => {
		const world = getCachedWorld()
		const { type, count } = world.landmarks!
		expect(type.length).toBeGreaterThanOrEqual(count)
	})

	it("producesTypeCodesInValidRange", () => {
		const world = getCachedWorld()
		const { type, count } = world.landmarks!
		for (let i = 0; i < count; i++) {
			expect(type[i]).toBeGreaterThanOrEqual(0)
			expect(type[i]).toBeLessThan(LANDMARK_TYPES.length)
		}
	})

	it("assignsEveryRegionToSomeLandmarkOrSentinel", () => {
		const world = getCachedWorld()
		const { regionLandmark } = world.landmarks!
		for (let r = 0; r < regionLandmark.length; r++) {
			expect(regionLandmark[r]).toBeGreaterThanOrEqual(-1)
		}
	})
})
