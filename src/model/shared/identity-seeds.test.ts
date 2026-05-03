import { describe, expect, it } from "vitest"
import { buildIdentitySeeds } from "./identity-seeds"

describe("buildIdentitySeeds", () => {
	it("is deterministic for the same input", () => {
		expect(Array.from(buildIdentitySeeds(4, 123))).toEqual(
			Array.from(buildIdentitySeeds(4, 123)),
		)
	})

	it("returns positive 32-bit seeds", () => {
		const seeds = buildIdentitySeeds(16, 456)

		expect(seeds).toHaveLength(16)
		for (const seed of seeds) {
			expect(seed).toBeGreaterThan(0)
			expect(seed).toBeLessThanOrEqual(0x7fffffff)
		}
	})
})
