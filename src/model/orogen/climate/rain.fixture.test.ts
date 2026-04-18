import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline rainfall output", () => {
	it("producesMonthlyRainfallArrayOfTwelveTimesN", () => {
		const world = getCachedWorld()
		expect(world.rainfall.monthly.length).toBe(12 * world.mesh.numRegions)
	})

	it("producesAnnualRainfallArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.rainfall.annual.length).toBe(world.mesh.numRegions)
	})

	it("producesNonNegativeMonthlyRainfall", () => {
		const world = getCachedWorld()
		const { monthly } = world.rainfall
		for (let i = 0; i < monthly.length; i++) {
			expect(monthly[i]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesNonNegativeAnnualRainfall", () => {
		const world = getCachedWorld()
		const { annual } = world.rainfall
		for (let r = 0; r < annual.length; r++) {
			expect(annual[r]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesEastMoistureArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.rainfall.east.length).toBe(world.mesh.numRegions)
	})

	it("producesWestMoistureArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.rainfall.west.length).toBe(world.mesh.numRegions)
	})

	it("producesHigherRainfallOnLandThanZero", () => {
		const world = getCachedWorld()
		const { annual, annual: _ann } = world.rainfall
		const { isLand } = world
		let landRainSum = 0
		let landCount = 0
		for (let r = 0; r < annual.length; r++) {
			if (isLand[r]) {
				landRainSum += annual[r]
				landCount++
			}
		}
		expect(landCount).toBeGreaterThan(0)
		expect(landRainSum / landCount).toBeGreaterThan(0)
	})
})
