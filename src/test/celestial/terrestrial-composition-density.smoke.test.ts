import { describe, expect, it } from "vitest"
import { ROLLS } from "@/model/celestial/system/generation/rolls"
import { RNG } from "@/model/shared/random/rng"

function meanDensity(params: {
	sizeClass: number
	orbitalDistanceAU: number
	luminositySol: number
	starAgeGyr: number
}): number {
	const rng = RNG.createRng({ seed: 1 })
	const N = 500
	let total = 0
	for (let i = 0; i < N; i++) {
		total += ROLLS.pickDensityEarthRelative({
			rng,
			group: "terrestrial",
			classification: "tectonic",
			...params,
		})
	}
	return total / N
}

describe("Terrestrial composition + density (book p. 71-72)", () => {
	it("jovian and chthonian bodies bypass the terrestrial table entirely", () => {
		const rng = RNG.createRng({ seed: 1 })
		for (let i = 0; i < 200; i++) {
			const density = ROLLS.pickDensityEarthRelative({
				rng,
				group: "jovian",
				classification: "tectonic",
				sizeClass: 17,
				orbitalDistanceAU: 5,
				luminositySol: 1,
				starAgeGyr: 4.6,
			})
			expect(density).toBeGreaterThanOrEqual(0.08)
			expect(density).toBeLessThanOrEqual(0.35)
		}
	})

	it("bigger worlds trend denser (size DM: 0-4 -1, 6-9 +1, 10-15 +3)", () => {
		const small = meanDensity({
			sizeClass: 2,
			orbitalDistanceAU: 1,
			luminositySol: 1,
			starAgeGyr: 4.6,
		})
		const medium = meanDensity({
			sizeClass: 8,
			orbitalDistanceAU: 1,
			luminositySol: 1,
			starAgeGyr: 4.6,
		})
		const large = meanDensity({
			sizeClass: 14,
			orbitalDistanceAU: 1,
			luminositySol: 1,
			starAgeGyr: 4.6,
		})
		expect(small).toBeLessThan(medium)
		expect(medium).toBeLessThan(large)
	})

	it("worlds beyond HZCO trend icier the further out they sit", () => {
		const atHzc = meanDensity({
			sizeClass: 8,
			orbitalDistanceAU: 1,
			luminositySol: 1,
			starAgeGyr: 4.6,
		})
		const beyond = meanDensity({
			sizeClass: 8,
			orbitalDistanceAU: 5,
			luminositySol: 1,
			starAgeGyr: 4.6,
		})
		const farBeyond = meanDensity({
			sizeClass: 8,
			orbitalDistanceAU: 30,
			luminositySol: 1,
			starAgeGyr: 4.6,
		})
		expect(beyond).toBeLessThan(atHzc)
		expect(farBeyond).toBeLessThan(beyond)
	})

	it("a world at or inside HZCO gets the same flat DM regardless of exact distance", () => {
		const closeIn = meanDensity({
			sizeClass: 8,
			orbitalDistanceAU: 0.3,
			luminositySol: 1,
			starAgeGyr: 4.6,
		})
		const atHzc = meanDensity({
			sizeClass: 8,
			orbitalDistanceAU: 1,
			luminositySol: 1,
			starAgeGyr: 4.6,
		})
		expect(closeIn).toBeCloseTo(atHzc, 1)
	})

	it("old systems (>10 Gyr) trend icier than young ones", () => {
		const young = meanDensity({
			sizeClass: 8,
			orbitalDistanceAU: 1,
			luminositySol: 1,
			starAgeGyr: 4.6,
		})
		const old = meanDensity({
			sizeClass: 8,
			orbitalDistanceAU: 1,
			luminositySol: 1,
			starAgeGyr: 11,
		})
		expect(old).toBeLessThan(young)
	})
})
