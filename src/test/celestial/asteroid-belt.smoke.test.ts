import { describe, expect, it } from "vitest"
import { ASTEROID_BELT } from "@/model/celestial/system/generation/asteroid-belt"

describe("ASTEROID_BELT.crossesAnyBelt", () => {
	it("is false for a circular orbit clear of every belt's span", () => {
		expect(
			ASTEROID_BELT.crossesAnyBelt({
				bodyOrbitalDistanceAU: 1,
				bodyEccentricity: 0,
				belts: [{ orbitalDistanceAU: 3, spanOrbitNumber: 0.2 }],
			}),
		).toBe(false)
	})

	it("is true when the belt sits exactly at the body's own circular orbit", () => {
		expect(
			ASTEROID_BELT.crossesAnyBelt({
				bodyOrbitalDistanceAU: 3,
				bodyEccentricity: 0,
				belts: [{ orbitalDistanceAU: 3, spanOrbitNumber: 0.2 }],
			}),
		).toBe(true)
	})

	it("is true when an eccentric orbit's aphelion reaches into a nearby belt's span", () => {
		// aphelion = 1 x (1 + 0.9) = 1.9 AU -- well inside this wide belt's range.
		expect(
			ASTEROID_BELT.crossesAnyBelt({
				bodyOrbitalDistanceAU: 1,
				bodyEccentricity: 0.9,
				belts: [{ orbitalDistanceAU: 1.7, spanOrbitNumber: 2 }],
			}),
		).toBe(true)
	})

	it("is false with no belts in the system", () => {
		expect(
			ASTEROID_BELT.crossesAnyBelt({
				bodyOrbitalDistanceAU: 1,
				bodyEccentricity: 0.9,
				belts: [],
			}),
		).toBe(false)
	})
})
