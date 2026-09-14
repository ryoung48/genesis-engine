import { describe, expect, it } from "vitest"
import { MOON } from "@/model/celestial/moons"
import { RNG } from "@/model/shared/random/rng"

function meanMoonCount(params: {
	parentGroup: "terrestrial" | "jovian"
	parentSizeClass: number
	orbitalDistanceAU: number
	nearCompanionExclusion?: boolean
}): number {
	const rng = RNG.createRng({ seed: 1 })
	const N = 2000
	let total = 0
	for (let i = 0; i < N; i++) {
		total += MOON.rollMoonCountForParent({ rng, ...params })
	}
	return total / N
}

describe("Significant Moon Quantity DM (book p. 54)", () => {
	it("a sub-Orbit#1 planet rolls fewer moons than the same planet further out", () => {
		const close = meanMoonCount({
			parentGroup: "terrestrial",
			parentSizeClass: 8,
			orbitalDistanceAU: 0.2,
		})
		const far = meanMoonCount({
			parentGroup: "terrestrial",
			parentSizeClass: 8,
			orbitalDistanceAU: 1,
		})
		expect(close).toBeLessThan(far)
	})

	it("a planet adjacent to a companion exclusion rolls fewer moons, same as sub-Orbit#1", () => {
		const adjacent = meanMoonCount({
			parentGroup: "terrestrial",
			parentSizeClass: 8,
			orbitalDistanceAU: 1,
			nearCompanionExclusion: true,
		})
		const subOrbit1 = meanMoonCount({
			parentGroup: "terrestrial",
			parentSizeClass: 8,
			orbitalDistanceAU: 0.2,
		})
		const ordinary = meanMoonCount({
			parentGroup: "terrestrial",
			parentSizeClass: 8,
			orbitalDistanceAU: 1,
		})
		expect(adjacent).toBeLessThan(ordinary)
		expect(adjacent).toBeCloseTo(subOrbit1, 0)
	})

	it("only one DM applies -- sub-Orbit#1 AND adjacent is no worse than either alone", () => {
		const both = meanMoonCount({
			parentGroup: "terrestrial",
			parentSizeClass: 8,
			orbitalDistanceAU: 0.2,
			nearCompanionExclusion: true,
		})
		const subOrbit1Only = meanMoonCount({
			parentGroup: "terrestrial",
			parentSizeClass: 8,
			orbitalDistanceAU: 0.2,
		})
		expect(both).toBeCloseTo(subOrbit1Only, 0)
	})

	it("the DM scales with dice count across size bands (1 die small, up to 4 dice giants)", () => {
		// A 1D-5 base (mean -2.5) floors to 0 moons most of the time regardless
		// of the DM, so only direction -- not magnitude -- is meaningful here;
		// the giant case below (mean well clear of the floor) checks magnitude.
		const smallClose = meanMoonCount({
			parentGroup: "terrestrial",
			parentSizeClass: 2,
			orbitalDistanceAU: 0.2,
		})
		const smallFar = meanMoonCount({
			parentGroup: "terrestrial",
			parentSizeClass: 2,
			orbitalDistanceAU: 1,
		})
		expect(smallClose).toBeLessThanOrEqual(smallFar)

		const giantClose = meanMoonCount({
			parentGroup: "jovian",
			parentSizeClass: 18,
			orbitalDistanceAU: 0.2,
		})
		const giantFar = meanMoonCount({
			parentGroup: "jovian",
			parentSizeClass: 18,
			orbitalDistanceAU: 1,
		})
		expect(giantFar - giantClose).toBeCloseTo(4, 0)
	})
})
