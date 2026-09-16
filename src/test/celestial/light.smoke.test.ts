import { describe, expect, it } from "vitest"
import { LIGHT } from "@/model/celestial/planet/light"

describe("LIGHT.computeLightProfile", () => {
	it("matches Sol's own real apparent magnitude from Earth at 1 luminositySol, 1 AU, no clouds", () => {
		const light = LIGHT.computeLightProfile({
			luminositySol: 1,
			orbitalDistanceAU: 1,
			cloudCoverFraction: 0,
		})
		expect(light.irradianceRelativeToEarth).toBeCloseTo(1, 6)
		expect(light.apparentMagnitude).toBeCloseTo(-26.74, 6)
		expect(light.effectiveApparentMagnitude).toBeCloseTo(-26.74, 6)
		expect(light.poorlyLit).toBe(false)
		expect(light.looksDark).toBe(false)
	})

	it("is dimmer further from the star, at the same luminosity", () => {
		const near = LIGHT.computeLightProfile({
			luminositySol: 1,
			orbitalDistanceAU: 1,
			cloudCoverFraction: 0,
		})
		const far = LIGHT.computeLightProfile({
			luminositySol: 1,
			orbitalDistanceAU: 10,
			cloudCoverFraction: 0,
		})
		expect(far.irradianceRelativeToEarth).toBeLessThan(
			near.irradianceRelativeToEarth,
		)
		expect(far.apparentMagnitude).toBeGreaterThan(near.apparentMagnitude)
	})

	it("cloud cover only dims effectiveApparentMagnitude, never apparentMagnitude or irradianceRelativeToEarth", () => {
		const clear = LIGHT.computeLightProfile({
			luminositySol: 1,
			orbitalDistanceAU: 1,
			cloudCoverFraction: 0,
		})
		const overcast = LIGHT.computeLightProfile({
			luminositySol: 1,
			orbitalDistanceAU: 1,
			cloudCoverFraction: 1,
		})
		expect(overcast.irradianceRelativeToEarth).toBeCloseTo(
			clear.irradianceRelativeToEarth,
			6,
		)
		expect(overcast.apparentMagnitude).toBeCloseTo(clear.apparentMagnitude, 6)
		expect(overcast.effectiveApparentMagnitude).toBeGreaterThan(
			clear.effectiveApparentMagnitude,
		)
	})

	it("looksDark implies poorlyLit", () => {
		// A very dim star, with heavy cloud cover, to cross both thresholds.
		const dim = LIGHT.computeLightProfile({
			luminositySol: 1e-8,
			orbitalDistanceAU: 1,
			cloudCoverFraction: 1,
		})
		expect(dim.looksDark).toBe(true)
		expect(dim.poorlyLit).toBe(true)
	})
})
