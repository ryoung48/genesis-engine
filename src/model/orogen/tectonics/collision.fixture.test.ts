import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline collision output", () => {
	it("producesStressArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.boundary.r_stress.length).toBe(world.mesh.numRegions)
	})

	it("producesFiniteStressForEveryRegion", () => {
		const world = getCachedWorld()
		const { r_stress } = world.boundary
		for (let r = 0; r < r_stress.length; r++) {
			expect(Number.isFinite(r_stress[r])).toBe(true)
		}
	})

	it("producesBoundaryTypeArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.boundary.r_boundaryType.length).toBe(world.mesh.numRegions)
	})

	it("producesMountainRegionsSet", () => {
		const world = getCachedWorld()
		expect(world.boundary.mountain_r).toBeDefined()
		expect(world.boundary.mountain_r.size).toBeGreaterThan(0)
	})

	it("producesCoastlineRegionsSet", () => {
		const world = getCachedWorld()
		expect(world.boundary.coastline_r).toBeDefined()
		expect(world.boundary.coastline_r.size).toBeGreaterThan(0)
	})

	it("producesSubductFactorArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.boundary.r_subductFactor.length).toBe(world.mesh.numRegions)
	})

	it("producesDistMountainArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.distFields.distMountain.length).toBe(world.mesh.numRegions)
	})

	it("producesNonNegativeDistMountainForEveryRegion", () => {
		// distMountain can be Infinity for cells far from mountains — just check non-negative
		const world = getCachedWorld()
		const { distMountain } = world.distFields
		for (let r = 0; r < distMountain.length; r++) {
			expect(distMountain[r]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesFiniteDistMountainForAtLeastSomeCells", () => {
		const world = getCachedWorld()
		const { distMountain } = world.distFields
		const finiteCount = Array.from(distMountain).filter(Number.isFinite).length
		expect(finiteCount).toBeGreaterThan(0)
	})
})
