import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"
import { computeOceanCurrents } from "./ocean-currents"

describe("computeOceanCurrents", () => {
	it("producesOceanWarmthArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		const result = computeOceanCurrents(
			world.mesh,
			world.isLand,
			world.distFields.distCoast,
			world.landmarks!,
			world.params,
			world.monthlyTEQ,
		)
		expect(result.oceanWarmth.length).toBe(world.mesh.numRegions)
	})

	it("producesOceanWarmthInBoundedRange", () => {
		const world = getCachedWorld()
		const result = computeOceanCurrents(
			world.mesh,
			world.isLand,
			world.distFields.distCoast,
			world.landmarks!,
			world.params,
			world.monthlyTEQ,
		)
		const { oceanWarmth } = result
		for (let r = 0; r < oceanWarmth.length; r++) {
			expect(oceanWarmth[r]).toBeGreaterThanOrEqual(-1)
			expect(oceanWarmth[r]).toBeLessThanOrEqual(1)
		}
	})

	it("assignsZeroOceanWarmthToLandCells", () => {
		const world = getCachedWorld()
		const result = computeOceanCurrents(
			world.mesh,
			world.isLand,
			world.distFields.distCoast,
			world.landmarks!,
			world.params,
			world.monthlyTEQ,
		)
		const { oceanWarmth } = result
		const { isLand } = world
		for (let r = 0; r < oceanWarmth.length; r++) {
			if (isLand[r]) {
				expect(oceanWarmth[r]).toBe(0)
			}
		}
	})

	it("producesCoastalWarmthArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		const result = computeOceanCurrents(
			world.mesh,
			world.isLand,
			world.distFields.distCoast,
			world.landmarks!,
			world.params,
			world.monthlyTEQ,
		)
		expect(result.coastalWarmth.length).toBe(world.mesh.numRegions)
	})

	it("producesCoastalWarmthInBoundedRange", () => {
		const world = getCachedWorld()
		const result = computeOceanCurrents(
			world.mesh,
			world.isLand,
			world.distFields.distCoast,
			world.landmarks!,
			world.params,
			world.monthlyTEQ,
		)
		const { coastalWarmth } = result
		for (let r = 0; r < coastalWarmth.length; r++) {
			expect(coastalWarmth[r]).toBeGreaterThanOrEqual(-1)
			expect(coastalWarmth[r]).toBeLessThanOrEqual(1)
		}
	})
})
