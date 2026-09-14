import { describe, expect, it } from "vitest"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { EMPTY_ORBITS } from "@/model/celestial/system/generation/empty-orbits"
import { RNG } from "@/model/shared/random/rng"

describe("Empty orbits", () => {
	it("does not add gaps to allocations with fewer than two worlds", () => {
		expect(
			EMPTY_ORBITS.roll({
				rng: RNG.createRng({ seed: 1 }),
				normalWorldCount: 0,
			}),
		).toBe(0)
		expect(
			EMPTY_ORBITS.roll({
				rng: RNG.createRng({ seed: 1 }),
				normalWorldCount: 1,
			}),
		).toBe(0)
	})

	it("rolls zero to three gaps for larger allocations", () => {
		for (let seed = 1; seed <= 500; seed++) {
			const count = EMPTY_ORBITS.roll({
				rng: RNG.createRng({ seed }),
				normalWorldCount: 2,
			})
			expect(count).toBeGreaterThanOrEqual(0)
			expect(count).toBeLessThanOrEqual(3)
		}
	})

	it("adds its result to each generated star allocation", () => {
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
		})
		for (const star of system.stars) {
			const allocation = star.worldTypeAllocation
			expect(allocation.totalWorlds).toBe(
				allocation.gasGiantCount +
					allocation.beltCount +
					allocation.terrestrialCount +
					allocation.emptyOrbitCount,
			)
		}
	})
})
