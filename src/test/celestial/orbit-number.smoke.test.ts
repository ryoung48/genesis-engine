import { describe, expect, it } from "vitest"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"

describe("Orbit# conversion", () => {
	it("converts the book's whole and fractional Orbit# values to AU", () => {
		expect(ORBIT_BODY.orbitNumberToAU({ orbitNumber: 3 })).toBe(1)
		expect(ORBIT_BODY.orbitNumberToAU({ orbitNumber: 3.5 })).toBe(1.3)
		expect(ORBIT_BODY.orbitNumberToAU({ orbitNumber: 19.5 })).toBe(59100)
	})

	it("inverts AU values and clamps the table boundary", () => {
		expect(ORBIT_BODY.auToOrbitNumber({ au: 1.3 })).toBe(3.5)
		expect(ORBIT_BODY.auToOrbitNumber({ au: 59100 })).toBe(19.5)
		expect(ORBIT_BODY.auToOrbitNumber({ au: Number.POSITIVE_INFINITY })).toBe(
			20,
		)
		expect(ORBIT_BODY.orbitNumberToAU({ orbitNumber: 100 })).toBe(78700)
	})
})
