import { describe, expect, it } from "vitest"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { WORLD_TYPE_COUNTS } from "@/model/celestial/system/generation/world-type-counts"
import { RNG } from "@/model/shared/random/rng"

describe("World type counts", () => {
	it("produces bounded type budgets that sum to the system total", () => {
		for (let seed = 1; seed <= 500; seed++) {
			const counts = WORLD_TYPE_COUNTS.roll({
				rng: RNG.createRng({ seed }),
				primarySpectralClass: "G",
				primaryLuminosityClass: "V",
				primaryMassSol: 1,
				primaryAgeGyr: 5,
				isLoneStar: true,
				systemPostStellarCount: 0,
				systemStarCount: 1,
				systemHasNeutronStar: false,
				systemHasBlackHole: false,
			})
			expect(counts.gasGiantCount).toBeGreaterThanOrEqual(0)
			expect(counts.gasGiantCount).toBeLessThanOrEqual(6)
			expect(counts.beltCount).toBeGreaterThanOrEqual(0)
			expect(counts.beltCount).toBeLessThanOrEqual(3)
			expect(counts.terrestrialCount).toBeGreaterThanOrEqual(3)
			expect(counts.terrestrialCount).toBeLessThanOrEqual(12)
			expect(counts.totalWorlds).toBe(
				counts.gasGiantCount + counts.beltCount + counts.terrestrialCount,
			)
		}
	})

	it("records one world-type budget for each generated galaxy system", () => {
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
		})
		expect(system.worldTypeCounts.totalWorlds).toBe(
			system.worldTypeCounts.gasGiantCount +
				system.worldTypeCounts.beltCount +
				system.worldTypeCounts.terrestrialCount,
		)
	})
})
