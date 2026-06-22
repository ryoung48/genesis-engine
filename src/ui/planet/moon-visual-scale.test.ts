import { describe, expect, it } from "vitest"
import {
	getMoonOrbitDistanceRelativeToPlanet,
	getMoonRadiusRelativeToPlanet,
	scaleMoonOrbitDistanceForDisplay,
	scaleMoonRadiusToPlanetVisualRadius,
} from "./moon-visual-scale"

describe("moon visual scale", () => {
	it("matches the Earth-Luna radius ratio", () => {
		expect(getMoonRadiusRelativeToPlanet(3474, 6371)).toBeCloseTo(0.2726, 4)
	})

	it("scales a rendered moon radius from the rendered planet radius", () => {
		expect(scaleMoonRadiusToPlanetVisualRadius(3474, 6371, 10)).toBeCloseTo(
			2.7264,
			4,
		)
	})

	it("converts orbital distance into planet radii", () => {
		expect(getMoonOrbitDistanceRelativeToPlanet(384400000, 6371)).toBeCloseTo(
			60.3359,
			4,
		)
	})

	it("compresses long moon orbits while keeping Luna near the outer display range", () => {
		expect(
			scaleMoonOrbitDistanceForDisplay({
				orbitalDistancePlanetRadii: 60.3359,
				maxOrbitalDistancePlanetRadii: 60.3359,
				minDisplayDistance: 1.35,
				maxDisplayDistance: 2.55,
			}),
		).toBeCloseTo(2.55, 2)
	})
})
