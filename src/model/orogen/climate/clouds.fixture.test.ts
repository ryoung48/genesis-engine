import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"
import { computeClouds } from "./clouds"

describe("computeClouds", () => {
	it("producesCloudCoverArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		const clouds = computeClouds(
			world.mesh,
			world.rainfall,
			world.isLand,
			world.params,
			world.monthlyTEQ,
		)
		expect(clouds.length).toBe(world.mesh.numRegions)
	})

	it("producesCloudCoverInUnitRange", () => {
		const world = getCachedWorld()
		const clouds = computeClouds(
			world.mesh,
			world.rainfall,
			world.isLand,
			world.params,
			world.monthlyTEQ,
		)
		for (let r = 0; r < clouds.length; r++) {
			expect(clouds[r]).toBeGreaterThanOrEqual(0)
			expect(clouds[r]).toBeLessThanOrEqual(1)
		}
	})

	it("producesFiniteCloudCoverForEveryRegion", () => {
		const world = getCachedWorld()
		const clouds = computeClouds(
			world.mesh,
			world.rainfall,
			world.isLand,
			world.params,
			world.monthlyTEQ,
		)
		for (let r = 0; r < clouds.length; r++) {
			expect(Number.isFinite(clouds[r])).toBe(true)
		}
	})

	it("producesAtLeastSomeCoverage", () => {
		const world = getCachedWorld()
		const clouds = computeClouds(
			world.mesh,
			world.rainfall,
			world.isLand,
			world.params,
			world.monthlyTEQ,
		)
		const total = clouds.reduce((a, b) => a + b, 0)
		expect(total).toBeGreaterThan(0)
	})
})
