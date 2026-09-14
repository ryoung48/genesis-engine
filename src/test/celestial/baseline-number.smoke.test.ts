import { describe, expect, it } from "vitest"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { BASELINE_NUMBER } from "@/model/celestial/system/generation/baseline-number"
import type { BaselineNumberInput } from "@/model/celestial/system/generation/baseline-number/types"
import { RNG } from "@/model/shared/random/rng"

function rollBaseline(params: BaselineNumberInput): number {
	return BASELINE_NUMBER.roll({
		rng: RNG.createRng({ seed: 1 }),
		...params,
	})!
}

describe("Baseline number", () => {
	it("applies every baseline-number DM", () => {
		const standard = rollBaseline({
			totalWorlds: 16,
			otherStarCount: 0,
			hasEpistellarCompanion: false,
			hostSpectralClass: "G",
			hostLuminosityClass: "V",
		})
		expect(
			rollBaseline({
				totalWorlds: 5,
				otherStarCount: 0,
				hasEpistellarCompanion: false,
				hostSpectralClass: "G",
				hostLuminosityClass: "V",
			}),
		).toBe(standard - 4)
		expect(
			rollBaseline({
				totalWorlds: 18,
				otherStarCount: 0,
				hasEpistellarCompanion: false,
				hostSpectralClass: "G",
				hostLuminosityClass: "V",
			}),
		).toBe(standard + 1)
		expect(
			rollBaseline({
				totalWorlds: 16,
				otherStarCount: 3,
				hasEpistellarCompanion: false,
				hostSpectralClass: "G",
				hostLuminosityClass: "V",
			}),
		).toBe(standard - 3)
		expect(
			rollBaseline({
				totalWorlds: 16,
				otherStarCount: 0,
				hasEpistellarCompanion: true,
				hostSpectralClass: "G",
				hostLuminosityClass: "V",
			}),
		).toBe(standard - 2)
		expect(
			rollBaseline({
				totalWorlds: 16,
				otherStarCount: 0,
				hasEpistellarCompanion: false,
				hostSpectralClass: "D",
				hostLuminosityClass: "V",
			}),
		).toBe(standard - 2)
		expect(
			rollBaseline({
				totalWorlds: 16,
				otherStarCount: 0,
				hasEpistellarCompanion: false,
				hostSpectralClass: "G",
				hostLuminosityClass: "III",
			}),
		).toBe(standard + 2)
		expect(
			rollBaseline({
				totalWorlds: 16,
				otherStarCount: 0,
				hasEpistellarCompanion: false,
				hostSpectralClass: "G",
				hostLuminosityClass: "Ia",
			}),
		).toBe(standard + 3)
		expect(
			rollBaseline({
				totalWorlds: 16,
				otherStarCount: 0,
				hasEpistellarCompanion: false,
				hostSpectralClass: "G",
				hostLuminosityClass: "IV",
			}),
		).toBe(standard + 1)
		expect(
			rollBaseline({
				totalWorlds: 16,
				otherStarCount: 0,
				hasEpistellarCompanion: false,
				hostSpectralClass: "G",
				hostLuminosityClass: "VI",
			}),
		).toBe(standard - 1)
	})

	it("does not roll a baseline for an empty allocation", () => {
		expect(
			BASELINE_NUMBER.roll({
				rng: RNG.createRng({ seed: 1 }),
				totalWorlds: 0,
				otherStarCount: 0,
				hasEpistellarCompanion: false,
				hostSpectralClass: "G",
				hostLuminosityClass: "V",
			}),
		).toBeNull()
	})

	it("records a baseline for every nonempty star allocation", () => {
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
		})
		for (const star of system.stars) {
			const { baselineNumber, totalWorlds } = star.worldTypeAllocation
			expect(baselineNumber === null).toBe(totalWorlds === 0)
		}
	})
})
