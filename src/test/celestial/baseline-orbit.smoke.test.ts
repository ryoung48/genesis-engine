import { describe, expect, it } from "vitest"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { BASELINE_ORBIT } from "@/model/celestial/system/generation/baseline-orbit"
import { DICE } from "@/model/shared/random/dice"
import { RNG } from "@/model/shared/random/rng"

describe("Baseline orbit", () => {
	it("uses the book's normal, cold, and hot equations", () => {
		const highNormalRoll = DICE.roll2d6(RNG.createRng({ seed: 1 }))
		expect(
			BASELINE_ORBIT.roll({
				rng: RNG.createRng({ seed: 1 }),
				baselineNumber: 2,
				totalWorlds: 4,
				habitableZoneOrbitNumber: 3,
				minimumOrbitNumber: 0,
				maximumOrbitNumber: 20,
			}),
		).toBe(3 + (highNormalRoll - 7) / 10)

		const lowNormalRoll = DICE.roll2d6(RNG.createRng({ seed: 2 }))
		expect(
			BASELINE_ORBIT.roll({
				rng: RNG.createRng({ seed: 2 }),
				baselineNumber: 2,
				totalWorlds: 4,
				habitableZoneOrbitNumber: 0.5,
				minimumOrbitNumber: 0,
				maximumOrbitNumber: 20,
			}),
		).toBe(0.5 + (lowNormalRoll - 7) / 100)

		const coldHighRoll = DICE.roll2d6(RNG.createRng({ seed: 3 }))
		expect(
			BASELINE_ORBIT.roll({
				rng: RNG.createRng({ seed: 3 }),
				baselineNumber: 0,
				totalWorlds: 4,
				habitableZoneOrbitNumber: 3,
				minimumOrbitNumber: 1,
				maximumOrbitNumber: 20,
			}),
		).toBe(7 + (coldHighRoll - 2) / 10)

		const coldLowRoll = DICE.roll2d6(RNG.createRng({ seed: 4 }))
		expect(
			BASELINE_ORBIT.roll({
				rng: RNG.createRng({ seed: 4 }),
				baselineNumber: -1,
				totalWorlds: 4,
				habitableZoneOrbitNumber: 0.5,
				minimumOrbitNumber: 0.2,
				maximumOrbitNumber: 20,
			}),
		).toBeCloseTo(0.3 + (coldLowRoll - 2) / 100)

		const hotHighRoll = DICE.roll2d6(RNG.createRng({ seed: 5 }))
		expect(
			BASELINE_ORBIT.roll({
				rng: RNG.createRng({ seed: 5 }),
				baselineNumber: 6,
				totalWorlds: 4,
				habitableZoneOrbitNumber: 5,
				minimumOrbitNumber: 0,
				maximumOrbitNumber: 20,
			}),
		).toBe(3 + (hotHighRoll - 7) / 5)

		const hotLowRoll = DICE.roll2d6(RNG.createRng({ seed: 6 }))
		expect(
			BASELINE_ORBIT.roll({
				rng: RNG.createRng({ seed: 6 }),
				baselineNumber: 7,
				totalWorlds: 4,
				habitableZoneOrbitNumber: 0.9,
				minimumOrbitNumber: 0.01,
				maximumOrbitNumber: 20,
			}),
		).toBeCloseTo(0.6 + (hotLowRoll - 7) / 50)
	})

	it("uses the book's lower bound and returns no orbit without a baseline", () => {
		expect(
			BASELINE_ORBIT.roll({
				rng: RNG.createRng({ seed: 1 }),
				baselineNumber: 20,
				totalWorlds: 3,
				habitableZoneOrbitNumber: 0.2,
				minimumOrbitNumber: 0.05,
				maximumOrbitNumber: 20,
			}),
		).toBe(0.1)
		expect(
			BASELINE_ORBIT.roll({
				rng: RNG.createRng({ seed: 1 }),
				baselineNumber: null,
				totalWorlds: 0,
				habitableZoneOrbitNumber: 3,
				minimumOrbitNumber: 0,
				maximumOrbitNumber: 20,
			}),
		).toBeNull()
	})

	it("moves unavailable results into the legal orbit interval", () => {
		const baselineOrbitNumber = BASELINE_ORBIT.roll({
			rng: RNG.createRng({ seed: 1 }),
			baselineNumber: 1,
			totalWorlds: 1,
			habitableZoneOrbitNumber: 0.2,
			minimumOrbitNumber: 1,
			maximumOrbitNumber: 3,
		})!
		expect(baselineOrbitNumber).toBeGreaterThanOrEqual(1)
		expect(baselineOrbitNumber).toBeLessThanOrEqual(3)
	})

	it("records a baseline orbit for every generated baseline number", () => {
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
		})
		for (const star of system.stars) {
			const allocation = star.worldTypeAllocation
			expect(allocation.baselineOrbitNumber === null).toBe(
				allocation.baselineNumber === null,
			)
		}
	})
})
