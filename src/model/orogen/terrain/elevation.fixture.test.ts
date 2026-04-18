import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline elevation output", () => {
	it("producesElevationArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.elevation.length).toBe(world.mesh.numRegions)
	})

	it("producesElevationKmArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.elevation_km.length).toBe(world.mesh.numRegions)
	})

	it("producesFiniteElevationKmForEveryRegion", () => {
		const world = getCachedWorld()
		const { elevation_km } = world
		for (let r = 0; r < elevation_km.length; r++) {
			expect(Number.isFinite(elevation_km[r])).toBe(true)
		}
	})

	it("producesAtLeastOneAboveSeaLevelCell", () => {
		const world = getCachedWorld()
		let found = false
		for (let r = 0; r < world.elevation.length; r++) {
			if (world.elevation[r] > 0) {
				found = true
				break
			}
		}
		expect(found).toBe(true)
	})

	it("producesAtLeastOneBelowSeaLevelCell", () => {
		const world = getCachedWorld()
		let found = false
		for (let r = 0; r < world.elevation.length; r++) {
			if (world.elevation[r] <= 0) {
				found = true
				break
			}
		}
		expect(found).toBe(true)
	})

	it("producesDistCoastArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.distFields.distCoast.length).toBe(world.mesh.numRegions)
	})

	it("producesNonNegativeFiniteDistCoastForEveryRegion", () => {
		const world = getCachedWorld()
		const { distCoast } = world.distFields
		for (let r = 0; r < distCoast.length; r++) {
			expect(Number.isFinite(distCoast[r])).toBe(true)
			expect(distCoast[r]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesOceanDistArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.oceanDist.length).toBe(world.mesh.numRegions)
	})

	it("producesNonNegativeFiniteOceanDistForEveryRegion", () => {
		const world = getCachedWorld()
		const { oceanDist } = world
		for (let r = 0; r < oceanDist.length; r++) {
			expect(Number.isFinite(oceanDist[r])).toBe(true)
			expect(oceanDist[r]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesHigherOceanDistForLandThanOceanOnAverage", () => {
		// oceanDist measures distance from land cells to nearest ocean — land should be higher on average
		const world = getCachedWorld()
		const { oceanDist, isLand } = world
		let landSum = 0,
			oceanSum = 0,
			landCount = 0,
			oceanCount = 0
		for (let r = 0; r < oceanDist.length; r++) {
			if (isLand[r]) {
				landSum += oceanDist[r]
				landCount++
			} else {
				oceanSum += oceanDist[r]
				oceanCount++
			}
		}
		expect(landCount).toBeGreaterThan(0)
		expect(oceanCount).toBeGreaterThan(0)
		expect(landSum / landCount).toBeGreaterThan(oceanSum / oceanCount)
	})
})
