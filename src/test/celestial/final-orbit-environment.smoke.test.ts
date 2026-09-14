import { describe, expect, it } from "vitest"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { FINAL_ORBIT_ENVIRONMENT } from "@/model/celestial/system/generation/final-orbit-environment"

describe("Final orbit environment", () => {
	it("derives AU, deviation, and zone from the final Orbit#", () => {
		const [slot] = FINAL_ORBIT_ENVIRONMENT.hydrate({
			luminositySol: 1,
			slots: [
				{
					orbitNumber: 3,
					type: "terrestrial",
					anomalousOrbitType: null,
					trojanCount: 0,
					isBaseline: true,
					orbitalDistanceAU: null,
					deviation: null,
					zone: null,
					spreadOrbitNumber: 0.5,
				},
			],
		})
		expect(slot?.orbitalDistanceAU).toBe(1)
		expect(slot?.deviation).toBe(0)
		expect(slot?.zone).toBe("inner")
	})

	it("uses finalized slots as the source of generated multi-star bodies", () => {
		let system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
		})
		for (
			let systemIndex = 1;
			system.stars.length === 1 && systemIndex < 100;
			systemIndex++
		) {
			system = GALAXY_SYSTEMS.generate({
				galaxySeed: 42,
				systemIndex,
				skipNaming: true,
			})
		}
		expect(system.stars.length).toBeGreaterThan(1)
		for (const star of system.stars) {
			const slots = star.worldTypeAllocation.orbitSlots.filter(
				(slot) => slot.type !== "empty",
			)
			const bodies = star.bodies.filter((body) => body.beltOfIdx === undefined)
			expect(bodies).toHaveLength(slots.length)
			for (const [index, slot] of slots.entries()) {
				const body = bodies[index]!
				expect(body.orbitalDistanceAU).toBe(slot.orbitalDistanceAU)
				if (slot.type === "gas-giant") expect(body.group).toBe("jovian")
				if (slot.type === "belt") expect(body.group).toBe("asteroid belt")
				if (slot.type === "terrestrial") expect(body.group).not.toBe("jovian")
			}
		}
	})
})
