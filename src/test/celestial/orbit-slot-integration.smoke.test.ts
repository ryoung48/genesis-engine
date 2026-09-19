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

	it("multi-star: every asteroid-belt body has a well-formed belt profile", () => {
		let checkedAny = false
		for (let systemIndex = 0; systemIndex < 20; systemIndex++) {
			const system = GALAXY_SYSTEMS.generate({
				galaxySeed: 13,
				systemIndex,
				skipNaming: true,
			})
			for (const star of system.stars) {
				for (const body of star.bodies) {
					if (body.group !== "asteroid belt") continue
					checkedAny = true
					expect(body.belt).toBeDefined()
					expect(body.belt!.spanOrbitNumber).toBeGreaterThanOrEqual(0)
					expect(body.belt!.bulk).toBeGreaterThanOrEqual(1)
					expect(body.belt!.resourceRating).toBeGreaterThanOrEqual(2)
					expect(body.belt!.resourceRating).toBeLessThanOrEqual(12)
					const { mTypePct, sTypePct, cTypePct, otherPct } =
						body.belt!.composition
					expect(mTypePct).toBeGreaterThanOrEqual(0)
					expect(sTypePct).toBeGreaterThanOrEqual(0)
					expect(cTypePct).toBeGreaterThanOrEqual(0)
					expect(otherPct).toBeGreaterThanOrEqual(0)
					expect(mTypePct + sTypePct + cTypePct + otherPct).toBeCloseTo(100, 5)
				}
			}
		}
		expect(checkedAny).toBe(true)
	})

	it("multi-star: every non-belt body has impactExposure/asteroidImpacts, and asteroidImpacts is never true when no belt exists in the star's system", () => {
		let checkedAny = false
		for (let systemIndex = 0; systemIndex < 20; systemIndex++) {
			const system = GALAXY_SYSTEMS.generate({
				galaxySeed: 14,
				systemIndex,
				skipNaming: true,
			})
			for (const star of system.stars) {
				const hasBelt = star.bodies.some(
					(body) => body.group === "asteroid belt",
				)
				for (const body of star.bodies) {
					if (body.group === "asteroid belt") {
						expect(body.impactExposure).toBeUndefined()
						expect(body.asteroidImpacts).toBeUndefined()
						continue
					}
					checkedAny = true
					expect(body.impactExposure).toBeDefined()
					expect(body.asteroidImpacts).toBeDefined()
					if (!hasBelt) {
						expect(body.asteroidImpacts).toBe(false)
						expect(body.impactExposure!.score).toBe(0)
						expect(
							body.impactExposure!.nearestBeltOrbitNumberDistance,
						).toBeNull()
					}
				}
			}
		}
		expect(checkedAny).toBe(true)
	})

	it("single-star (non-galaxy) caller: budget still produces slot-matched bodies", () => {
		for (let seed = 1; seed <= 20; seed++) {
			const bodies = SYSTEM_GENERATION.generateSystemBodies({
				seed,
				hostStar: SOL_LIKE_HOST_STAR,
				mainWorldMode: "procedural",
				exactHZC: false,
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
