import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"
import { BIOME_LABELS, CLIMATE_LABELS } from "./vegetation"

describe("pipeline vegetation output", () => {
	it("producesClimateZonesArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.climateZones.length).toBe(world.mesh.numRegions)
	})

	it("producesClimateZoneCodesInValidRange", () => {
		const world = getCachedWorld()
		const { climateZones } = world
		for (let r = 0; r < climateZones.length; r++) {
			expect(climateZones[r]).toBeGreaterThanOrEqual(0)
			expect(climateZones[r]).toBeLessThan(CLIMATE_LABELS.length)
		}
	})

	it("assignsOceanClimateZoneToAllOceanCells", () => {
		const world = getCachedWorld()
		const { climateZones, isLand } = world
		for (let r = 0; r < climateZones.length; r++) {
			if (!isLand[r]) {
				expect(climateZones[r]).toBe(0) // 0 = ocean
			}
		}
	})

	it("producesVegetationArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.vegetation.length).toBe(world.mesh.numRegions)
	})

	it("producesVegetationCodesInValidRange", () => {
		const world = getCachedWorld()
		const { vegetation } = world
		for (let r = 0; r < vegetation.length; r++) {
			expect(vegetation[r]).toBeGreaterThanOrEqual(0)
			expect(vegetation[r]).toBeLessThan(BIOME_LABELS.length)
		}
	})

	it("assignsOceanVegetationToAllOceanCells", () => {
		const world = getCachedWorld()
		const { vegetation, isLand } = world
		for (let r = 0; r < vegetation.length; r++) {
			if (!isLand[r]) {
				expect(vegetation[r]).toBe(0) // 0 = ocean
			}
		}
	})
})
