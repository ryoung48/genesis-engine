import { describe, expect, it } from "vitest"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"

const JUPITER_MASS_KG = 1.898e27
const SATURN_MASS_KG = 5.683e26

describe("ORBIT_BODY.minimumSpacedOrbitAU", () => {
	it("lets Saturn keep its real 9.58 AU orbit outside Jupiter's 5.2 AU", () => {
		const minimumAU = ORBIT_BODY.minimumSpacedOrbitAU({
			innerOrbitalDistanceAU: 5.2,
			innerMassKg: JUPITER_MASS_KG,
			outerMassKg: SATURN_MASS_KG,
			starMassKg: ORBIT_BODY.solarMassKg,
		})
		expect(minimumAU).toBeGreaterThan(9)
		expect(minimumAU).toBeLessThan(9.58)
	})

	it("needs only a small step between two Earth-mass planets", () => {
		const minimumAU = ORBIT_BODY.minimumSpacedOrbitAU({
			innerOrbitalDistanceAU: 1,
			innerMassKg: ORBIT_BODY.earthMassKg,
			outerMassKg: ORBIT_BODY.earthMassKg,
			starMassKg: ORBIT_BODY.solarMassKg,
		})
		expect(minimumAU).toBeGreaterThan(1.05)
		expect(minimumAU).toBeLessThan(1.15)
	})
})
