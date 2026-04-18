import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline erosion output", () => {
	it("producesFiniteElevationForEveryRegion", () => {
		const world = getCachedWorld()
		const { elevation } = world
		for (let r = 0; r < elevation.length; r++) {
			expect(Number.isFinite(elevation[r])).toBe(true)
		}
	})

	it("producesFiniteElevationKmForEveryRegion", () => {
		const world = getCachedWorld()
		const { elevation_km } = world
		for (let r = 0; r < elevation_km.length; r++) {
			expect(Number.isFinite(elevation_km[r])).toBe(true)
		}
	})

	it("producesNonNegativeElevationKmForLandCells", () => {
		const world = getCachedWorld()
		const { elevation_km, isLand } = world
		for (let r = 0; r < elevation_km.length; r++) {
			if (isLand[r]) {
				expect(elevation_km[r]).toBeGreaterThanOrEqual(0)
			}
		}
	})

	it("producesLowerAverageElevationForOceanCellsThanLandCells", () => {
		// isLand is set before erosion; post-erosion some boundary cells may shift,
		// but ocean cells should still average much lower than land cells
		const world = getCachedWorld()
		const { elevation, isLand } = world
		let landSum = 0,
			oceanSum = 0,
			landCount = 0,
			oceanCount = 0
		for (let r = 0; r < elevation.length; r++) {
			if (isLand[r]) {
				landSum += elevation[r]
				landCount++
			} else {
				oceanSum += elevation[r]
				oceanCount++
			}
		}
		expect(landCount).toBeGreaterThan(0)
		expect(oceanCount).toBeGreaterThan(0)
		expect(landSum / landCount).toBeGreaterThan(oceanSum / oceanCount)
	})

	it("producesElevationWithNegativeFloor", () => {
		// Elevation should span negative values (ocean exists)
		const world = getCachedWorld()
		const { elevation } = world
		const minElev = Math.min(...elevation)
		expect(minElev).toBeLessThan(0)
	})
})
