import { describe, expect, it } from "vitest"
import { TIDAL_FORCE } from "@/model/climate/ocean/tides/tidal-force"

const tideParams = {
	starLatRad: 0,
	starLonRad: 0,
	starDistanceM: 1.496e11,
	surfaceLatRad: 0,
	surfaceLonRad: 0,
	planetMassKg: 5.972e24,
	planetRadiusM: 6.371e6,
}

describe("spectral host tides", () => {
	it.each([
		["white dwarf", 0.62],
		["neutron star", 1.4],
		["black hole", 8],
	])("models a %s host from its direct mass", (_, massSol) => {
		const tide = TIDAL_FORCE.starTideContribution({
			...tideParams,
			starMassKg: massSol * 1.989e30,
		})
		expect(tide).toBeGreaterThan(0)
	})

	it("uses a companion host's physical mass rather than its primary's", () => {
		const primaryTide = TIDAL_FORCE.starTideContribution({
			...tideParams,
			starMassKg: 1.989e30,
		})
		const companionTide = TIDAL_FORCE.starTideContribution({
			...tideParams,
			starMassKg: 0.5 * 1.989e30,
		})
		expect(companionTide).toBeCloseTo(primaryTide / 2)
	})
})
