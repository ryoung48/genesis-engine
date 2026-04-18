import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline hydrology output", () => {
	it("producesAetMonthlyArrayOfTwelveTimesN", () => {
		const world = getCachedWorld()
		expect(world.hydrology.aet_monthly.length).toBe(12 * world.mesh.numRegions)
	})

	it("producesNonNegativeAetForEveryCell", () => {
		const world = getCachedWorld()
		const { aet_monthly } = world.hydrology
		for (let i = 0; i < aet_monthly.length; i++) {
			expect(aet_monthly[i]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesAridityMonthlyArrayOfTwelveTimesN", () => {
		const world = getCachedWorld()
		expect(world.hydrology.aridity_monthly.length).toBe(
			12 * world.mesh.numRegions,
		)
	})

	it("producesBaseflowMonthlyArrayOfTwelveTimesN", () => {
		const world = getCachedWorld()
		expect(world.hydrology.baseflow_monthly.length).toBe(
			12 * world.mesh.numRegions,
		)
	})

	it("producesNonNegativeBaseflowForEveryCell", () => {
		const world = getCachedWorld()
		const { baseflow_monthly } = world.hydrology
		for (let i = 0; i < baseflow_monthly.length; i++) {
			expect(baseflow_monthly[i]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesAetNotExceedingPetForLandCells", () => {
		const world = getCachedWorld()
		const N = world.mesh.numRegions
		const { aet_monthly } = world.hydrology
		const { pet_monthly } = world.climate
		const { isLand } = world

		for (let m = 0; m < 12; m++) {
			for (let r = 0; r < N; r++) {
				if (isLand[r]) {
					const aet = aet_monthly[m * N + r]
					const pet = pet_monthly[m * N + r]
					// AET (actual) cannot exceed PET (potential) — with a small tolerance for numerics
					expect(aet).toBeLessThanOrEqual(pet + 1e-3)
				}
			}
		}
	})
})
