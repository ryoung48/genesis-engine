import { describe, expect, it } from "vitest"
import { ALBEDO } from "./albedo"
import { EMB_CONSTANTS } from "./constants"

describe("ALBEDO", () => {
	it("builds land fractions across tropical, temperate, and polar latitude bands", () => {
		const fractions = ALBEDO.landFraction()

		expect(fractions).toHaveLength(EMB_CONSTANTS.grid.NUM_LAT)
		expect(fractions[0]).toBe(0.2)
		expect(fractions[Math.floor(EMB_CONSTANTS.grid.NUM_LAT / 4)]).toBe(0.3)
		expect(fractions[Math.floor(EMB_CONSTANTS.grid.NUM_LAT / 2)]).toBe(0.35)
	})

	it("uses the ice branch with low-obliquity clamping", () => {
		const count = EMB_CONSTANTS.grid.NUM_LAT
		const albedo = Array.from({ length: count }, () => [0])
		ALBEDO.update({
			albedo,
			lats_deg: new Array(count).fill(0),
			temperature: Array.from({ length: count }, () => [-20]),
			land_fraction: new Array(count).fill(0.2),
			time: 0,
			orbital: { ...EMB_CONSTANTS.orbital, OBLIQUITY: 0 },
		})

		expect(albedo[0][0]).toBeCloseTo(EMB_CONSTANTS.surface.ALBEDO.ICE, 6)
		expect(albedo[count - 1][0]).toBeCloseTo(
			EMB_CONSTANTS.surface.ALBEDO.ICE,
			6,
		)
	})

	it("blends land and ocean albedo when temperatures stay above the local ice limit", () => {
		const count = EMB_CONSTANTS.grid.NUM_LAT
		const albedo = Array.from({ length: count }, () => [0])
		ALBEDO.update({
			albedo,
			lats_deg: new Array(count).fill(30),
			temperature: Array.from({ length: count }, () => [300]),
			land_fraction: new Array(count).fill(0.25),
			time: 0,
			orbital: { ...EMB_CONSTANTS.orbital, OBLIQUITY: 70 },
		})

		expect(albedo[0][0]).toBeCloseTo(
			EMB_CONSTANTS.surface.ALBEDO.OCEAN * 0.75 +
				EMB_CONSTANTS.surface.ALBEDO.LAND * 0.25,
			6,
		)
	})
})
