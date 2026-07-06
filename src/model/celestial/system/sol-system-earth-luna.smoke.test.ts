import { describe, expect, it } from "vitest"
import { SOL_LUNA_DEFAULT, SOL_MAIN_WORLD_DEFAULTS, SOL_SYSTEM_BODIES } from "./sol-system"

describe("Earth/Luna as SOL_PLANET_SEEDS entries", () => {
	it("SOL_SYSTEM_BODIES excludes Earth (built live by buildHomeBody instead)", () => {
		expect(SOL_SYSTEM_BODIES.some((b) => b.name === "Earth")).toBe(false)
		expect(SOL_SYSTEM_BODIES.length).toBe(9)
	})

	it("SOL_MAIN_WORLD_DEFAULTS matches the original Earth values", () => {
		expect(SOL_MAIN_WORLD_DEFAULTS.planetRadiusKm).toBeCloseTo(6371, 5)
		expect(SOL_MAIN_WORLD_DEFAULTS.obliquity).toBe(23.5)
		expect(SOL_MAIN_WORLD_DEFAULTS.eccentricity).toBe(0.0167)
		expect(SOL_MAIN_WORLD_DEFAULTS.orbitalDistanceAU).toBe(1)
		expect(SOL_MAIN_WORLD_DEFAULTS.hoursPerDay).toBe(24)
		expect(SOL_MAIN_WORLD_DEFAULTS.albedo).toBe(0.3)
		expect(SOL_MAIN_WORLD_DEFAULTS.greenhouseFactor).toBe(0.534)
		expect(SOL_MAIN_WORLD_DEFAULTS.moonCount).toBe(1)
	})

	it("SOL_LUNA_DEFAULT matches the original fixed Luna values", () => {
		expect(SOL_LUNA_DEFAULT.name).toBe("Luna")
		expect(SOL_LUNA_DEFAULT.massKg).toBeCloseTo(7.34e22, 5)
		expect(SOL_LUNA_DEFAULT.diameterKm).toBeCloseTo(3474, 5)
		expect(SOL_LUNA_DEFAULT.sizeClass).toBe(2)
		expect(SOL_LUNA_DEFAULT.hydrosphereFraction).toBe(0)
		expect(SOL_LUNA_DEFAULT.atmosphere).toEqual({
			code: 0,
			pressureBar: 0,
			type: "vacuum",
			breathable: false,
		})
		expect(SOL_LUNA_DEFAULT.orbitalPeriodDays).toBeCloseTo(27.3, 5)
		expect(SOL_LUNA_DEFAULT.siderealDayHours).toBeCloseTo(27.3 * 24, 5)
		expect(SOL_LUNA_DEFAULT.eccentricity).toBe(0.055)
		expect(SOL_LUNA_DEFAULT.inclinationDeg).toBe(5.1)
		expect(SOL_LUNA_DEFAULT.longitudeOfAscendingNodeDeg).toBe(0)
		expect(SOL_LUNA_DEFAULT.longitudeOfPerihelionDeg).toBe(0)
		expect(SOL_LUNA_DEFAULT.meanAnomalyAtEpochDeg).toBe(0)
		expect(SOL_LUNA_DEFAULT.axialTiltDeg).toBe(6.7)
		expect(SOL_LUNA_DEFAULT.orbitRange).toBe("middle")
		expect(SOL_LUNA_DEFAULT.semiMajorAxisPlanetDiameters).toBe(30.17)
		expect(SOL_LUNA_DEFAULT.albedo).toBe(0.12)
		expect(SOL_LUNA_DEFAULT.greenhouseFactor).toBe(0)
	})
})
