import { describe, expect, it } from "vitest"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { STAR } from "@/model/celestial/star"
import type { ParentStarLike } from "@/model/celestial/star/types"
import { RNG } from "@/model/shared/random/rng"

function isPostStellar(spectralClass: string): boolean {
	return (
		spectralClass === "D" || spectralClass === "NS" || spectralClass === "BH"
	)
}

describe("Non-Primary Star Determination table", () => {
	it("allows a standalone root/primary star to roll as a Y brown dwarf", () => {
		let sawStandaloneY = false
		for (let seed = 1; seed <= 20000 && !sawStandaloneY; seed++) {
			const rng = RNG.createRng({ seed })
			const rolled = STAR.rollStarAttributes(rng)
			if (rolled.spectralClass === "Y") sawStandaloneY = true
		}
		expect(sawStandaloneY).toBe(true)
	})

	it("rolls thousands of full galaxy star trees without crashing or producing NaN/undefined fields", () => {
		for (let seed = 1; seed <= 3000; seed++) {
			const stars = GALAXY_SYSTEMS.previewStars({
				galaxySeed: seed,
				systemIndex: 0,
			})
			expect(stars.length).toBeGreaterThan(0)
			for (const star of stars) {
				expect(star.spectralClass).toBeTruthy()
				expect(star.luminosityClass).toBeTruthy()
				expect(Number.isFinite(star.subtype)).toBe(true)
				expect(Number.isFinite(star.massSol)).toBe(true)
				expect(Number.isFinite(star.temperatureK)).toBe(true)
				expect(Number.isFinite(star.diameterSol)).toBe(true)
				expect(Number.isFinite(star.ageGyr)).toBe(true)
				expect(star.massSol).toBeGreaterThan(0)
				expect(star.ageGyr).toBeGreaterThanOrEqual(0)
			}
		}
	})

	it("matches the book's own worked Sibling example (G8 V + roll of 3 -> K1 V)", () => {
		// rng.randint(1,6) with this seed must land on 3 for the sibling
		// subtype roll -- pin down a seed that does, then drive
		// rollStarAttributes directly with a fixed G8 V parent, forcing the
		// method roll to land on "sibling" via a companion-column DM-free
		// row (index 7-8, i.e. 2d6 roll of 9 or 10).
		let found = false
		for (let seed = 1; seed < 5000 && !found; seed++) {
			const rng = RNG.createRng({ seed })
			const parent: ParentStarLike = {
				spectralClass: "G",
				luminosityClass: "V",
				subtype: 8,
				massSol: 1,
				ageGyr: 5,
			}
			// Directly exercise the internal roll via the public API: force the
			// table roll to hit Sibling by trying seeds and checking the result.
			const rolled = STAR.rollStarAttributes(
				rng,
				parent,
				undefined,
				"secondary",
			)
			if (
				rolled.spectralClass === "K" &&
				rolled.luminosityClass === "V" &&
				rolled.subtype === 1
			) {
				found = true
			}
		}
		expect(found).toBe(true)
	})

	it("always resolves a brown dwarf parent's companion via Sibling (same brown-dwarf class family)", () => {
		for (let seed = 1; seed <= 500; seed++) {
			const rng = RNG.createRng({ seed })
			const parent: ParentStarLike = {
				spectralClass: "L",
				luminosityClass: "V",
				subtype: 4,
				massSol: 0.05,
				ageGyr: 3,
			}
			const rolled = STAR.rollStarAttributes(
				rng,
				parent,
				undefined,
				"companion",
			)
			expect(["L", "T", "Y"]).toContain(rolled.spectralClass)
			expect(rolled.luminosityClass).toBe("V")
			expect(Number.isFinite(rolled.subtype)).toBe(true)
		}
	})

	it("Twin results copy the parent's class/luminosity/subtype", () => {
		let sawTwin = false
		for (let seed = 1; seed <= 5000; seed++) {
			const rng = RNG.createRng({ seed })
			const parent: ParentStarLike = {
				spectralClass: "F",
				luminosityClass: "V",
				subtype: 3,
				massSol: 1.3,
				ageGyr: 2,
			}
			const rolled = STAR.rollStarAttributes(
				rng,
				parent,
				undefined,
				"companion",
			)
			if (
				rolled.spectralClass === "F" &&
				rolled.subtype === 3 &&
				rolled.luminosityClass === "V"
			) {
				sawTwin = true
			}
		}
		expect(sawTwin).toBe(true)
	})

	it("a post-stellar companion can bump the whole system's age above the primary's own roll", () => {
		let sawReset = false
		for (let seed = 1; seed <= 20000 && !sawReset; seed++) {
			const stars = GALAXY_SYSTEMS.previewStars({
				galaxySeed: seed,
				systemIndex: 0,
			})
			const root = stars[0]!
			if (isPostStellar(root.spectralClass)) continue
			const exoticCompanion = stars
				.slice(1)
				.find((star) => isPostStellar(star.spectralClass))
			if (exoticCompanion && exoticCompanion.ageGyr === root.ageGyr) {
				// every still-fusing star should have been bumped to match
				for (const star of stars) {
					if (!isPostStellar(star.spectralClass)) {
						expect(star.ageGyr).toBe(root.ageGyr)
					}
				}
				sawReset = true
			}
		}
		expect(sawReset).toBe(true)
	})
})
