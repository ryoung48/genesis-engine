import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline ice output", () => {
	it("producesIceThicknessArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.iceThickness.length).toBe(world.mesh.numRegions)
	})

	it("producesNonNegativeIceThickness", () => {
		const world = getCachedWorld()
		const { iceThickness } = world
		for (let r = 0; r < iceThickness.length; r++) {
			expect(iceThickness[r]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesIceMinMonthlyArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.iceMinMonthly.length).toBe(world.mesh.numRegions)
	})

	it("producesIceMaxMonthlyArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.iceMaxMonthly.length).toBe(world.mesh.numRegions)
	})

	it("producesNonNegativeIceMinMonthly", () => {
		const world = getCachedWorld()
		const { iceMinMonthly } = world
		for (let r = 0; r < iceMinMonthly.length; r++) {
			expect(iceMinMonthly[r]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesIceMaxAtLeastIceMinForEveryRegion", () => {
		const world = getCachedWorld()
		const { iceMinMonthly, iceMaxMonthly } = world
		for (let r = 0; r < iceMinMonthly.length; r++) {
			expect(iceMaxMonthly[r]).toBeGreaterThanOrEqual(iceMinMonthly[r])
		}
	})

	it("producesHigherIceThicknessAtHighLatitudesThanTropics", () => {
		const world = getCachedWorld()
		const { r_xyz } = world.mesh
		const { iceThickness } = world

		let polarIce = 0
		let polarCount = 0
		let tropicalIce = 0
		let tropicalCount = 0

		for (let r = 0; r < iceThickness.length; r++) {
			const z = r_xyz[3 * r + 2]
			const latDeg = (Math.asin(z) * 180) / Math.PI
			if (Math.abs(latDeg) > 70) {
				polarIce += iceThickness[r]
				polarCount++
			} else if (Math.abs(latDeg) < 15) {
				tropicalIce += iceThickness[r]
				tropicalCount++
			}
		}

		const polarMean = polarCount > 0 ? polarIce / polarCount : 0
		const tropicalMean = tropicalCount > 0 ? tropicalIce / tropicalCount : 0
		expect(polarMean).toBeGreaterThanOrEqual(tropicalMean)
	})
})
