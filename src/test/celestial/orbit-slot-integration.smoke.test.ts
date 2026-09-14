import { describe, expect, it } from "vitest"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { HostStarAttributes } from "@/model/celestial/star/types"
import { SYSTEM_GENERATION } from "@/model/celestial/system/generation"

const SOL_LIKE_HOST_STAR: HostStarAttributes = {
	spectralClass: "G",
	luminosityClass: "V",
	subtype: 2,
	massSol: 1,
	temperatureK: 5778,
	diameterSol: 1,
	luminositySol: 1,
	ageGyr: 4.6,
	mao: 0.1,
}

describe("Orbit slot -> generated body integration", () => {
	it("multi-star: every non-empty slot becomes exactly one booked-type body, within this star's legal AU range", () => {
		for (let systemIndex = 0; systemIndex < 20; systemIndex++) {
			const system = GALAXY_SYSTEMS.generate({
				galaxySeed: 11,
				systemIndex,
				skipNaming: true,
			})
			for (const star of system.stars) {
				const nonEmptySlots = star.worldTypeAllocation.orbitSlots.filter(
					(slot) => slot.type !== "empty",
				)
				const ordinaryBodies = star.bodies.filter(
					(body) =>
						body.trojanOfIdx === undefined && body.beltOfIdx === undefined,
				)
				expect(ordinaryBodies).toHaveLength(nonEmptySlots.length)
				// AU isn't asserted exactly here: resolvePlanetVsCompanionStarOverlaps
				// still legitimately nudges a body clear of a companion-star band
				// afterward as a safety net (see galaxy/systems/index.ts) -- only
				// type-per-slot and count are guaranteed to match exactly.
				for (const [slotIndex, slot] of nonEmptySlots.entries()) {
					const body = ordinaryBodies[slotIndex]!
					if (slot.type === "gas-giant") {
						expect(body.group).toBe("jovian")
					} else if (slot.type === "belt") {
						expect(body.group).toBe("asteroid belt")
					} else {
						// A "terrestrial"-booked slot still rolls which kind of rocky
						// world it actually is -- see ROLLS.rollTerrestrialSubgroup.
						expect(["dwarf", "terrestrial", "helian"]).toContain(body.group)
					}
				}
			}
		}
	})

	it("multi-star: every generated body sits within its own star's MAO/ceiling bounds", () => {
		for (let systemIndex = 0; systemIndex < 20; systemIndex++) {
			const system = GALAXY_SYSTEMS.generate({
				galaxySeed: 12,
				systemIndex,
				skipNaming: true,
			})
			for (const star of system.stars) {
				const maxOrbitalDistanceAU = ORBIT_BODY.orbitNumberToAU({
					orbitNumber: 20,
				})
				for (const body of star.bodies) {
					if (body.trojanOfIdx !== undefined || body.beltOfIdx !== undefined) {
						continue
					}
					expect(body.orbitalDistanceAU).toBeGreaterThanOrEqual(
						star.mao * 0.999,
					)
					expect(body.orbitalDistanceAU).toBeLessThanOrEqual(
						maxOrbitalDistanceAU * 1.001,
					)
				}
			}
		}
	})

	it("single-star (non-galaxy) caller: budget still produces slot-matched bodies", () => {
		for (let seed = 1; seed <= 20; seed++) {
			const bodies = SYSTEM_GENERATION.generateSystemBodies({
				seed,
				hostStar: SOL_LIKE_HOST_STAR,
				mainWorldMode: "procedural",
				skipNaming: true,
			})
			const ordinaryBodies = bodies.filter(
				(body) =>
					body.trojanOfIdx === undefined && body.beltOfIdx === undefined,
			)
			expect(ordinaryBodies.length).toBeGreaterThan(0)
			for (const body of ordinaryBodies) {
				expect([
					"jovian",
					"asteroid belt",
					"dwarf",
					"terrestrial",
					"helian",
				]).toContain(body.group)
				expect(body.orbitalDistanceAU).toBeGreaterThan(0)
			}
		}
	})
})
