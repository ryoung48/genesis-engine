import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline hazard output", () => {
	it("producesEarthquakeArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.hazards.earthquake.length).toBe(world.mesh.numRegions)
	})

	it("producesVolcanoArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.hazards.volcano.length).toBe(world.mesh.numRegions)
	})

	it("producesDangerArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.hazards.danger.length).toBe(world.mesh.numRegions)
	})

	it("producesEarthquakeValuesInUnitRange", () => {
		const world = getCachedWorld()
		const { earthquake } = world.hazards
		for (let r = 0; r < earthquake.length; r++) {
			expect(earthquake[r]).toBeGreaterThanOrEqual(0)
			expect(earthquake[r]).toBeLessThanOrEqual(1)
		}
	})

	it("producesVolcanoValuesInUnitRange", () => {
		const world = getCachedWorld()
		const { volcano } = world.hazards
		for (let r = 0; r < volcano.length; r++) {
			expect(volcano[r]).toBeGreaterThanOrEqual(0)
			expect(volcano[r]).toBeLessThanOrEqual(1)
		}
	})

	it("producesDangerValuesInUnitRange", () => {
		const world = getCachedWorld()
		const { danger } = world.hazards
		for (let r = 0; r < danger.length; r++) {
			expect(danger[r]).toBeGreaterThanOrEqual(0)
			expect(danger[r]).toBeLessThanOrEqual(1)
		}
	})
})
