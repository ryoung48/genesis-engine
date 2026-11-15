import { describe, expect, it } from "vitest"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { WORLD_TYPE_ALLOCATION } from "@/model/celestial/system/generation/world-type-allocation"

describe("World type allocation", () => {
	it("applies each binary fit only within its sampled domain", () => {
		const circular = { orbitalDistanceAU: 1, eccentricity: 0, massRatio: 0.5 }
		expect(BINARY_ORBIT.circumstellarLimitAU(circular)).toBeCloseTo(0.274)
		expect(BINARY_ORBIT.circumbinaryLimitAU(circular)).toBeCloseTo(2.3875)
		expect(
			BINARY_ORBIT.circumstellarLimitAU({ ...circular, massRatio: 0.2 }),
		).toBeCloseTo(0.388)
		expect(
			BINARY_ORBIT.circumstellarLimitAU({ ...circular, massRatio: 0.8 }),
		).toBeCloseTo(0.16)
		expect(
			BINARY_ORBIT.circumstellarLimitAU({ ...circular, massRatio: 0.09 }),
		).toBe(0)
		expect(
			BINARY_ORBIT.circumbinaryLimitAU({ ...circular, eccentricity: 0.75 }),
		).toBe(Infinity)
	})
	it("rounds each world type independently by star capacity", () => {
		const allocations = WORLD_TYPE_ALLOCATION.allocate({
			worldTypeCounts: {
				gasGiantCount: 3,
				beltCount: 2,
				terrestrialCount: 6,
				totalWorlds: 11,
			},
			stars: [
				{
					orbitalDistanceAU: 0,
					mao: 0,
					maxOrbitalDistanceAU: ORBIT_BODY.orbitNumberToAU({ orbitNumber: 4 }),
					acceptsBodies: true,
				},
				{
					orbitalDistanceAU: 10,
					mao: 0,
					maxOrbitalDistanceAU: ORBIT_BODY.orbitNumberToAU({ orbitNumber: 3 }),
					acceptsBodies: true,
				},
				{
					orbitalDistanceAU: 20,
					mao: 0,
					maxOrbitalDistanceAU: ORBIT_BODY.orbitNumberToAU({ orbitNumber: 3 }),
					acceptsBodies: true,
				},
				{
					orbitalDistanceAU: 0.2,
					mao: 0,
					maxOrbitalDistanceAU: ORBIT_BODY.orbitNumberToAU({ orbitNumber: 10 }),
					acceptsBodies: false,
				},
			],
		})
		expect(allocations.map((allocation) => allocation.gasGiantCount)).toEqual([
			2, 0, 1, 0,
		])
		expect(allocations.map((allocation) => allocation.beltCount)).toEqual([
			1, 0, 1, 0,
		])
		expect(
			allocations.map((allocation) => allocation.terrestrialCount),
		).toEqual([3, 1, 2, 0])
	})

	it("reconciles each rolled count with accepted regular slots and unplaced requests", () => {
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
		})
		const slots = system.stars.flatMap((star) =>
			star.regions.flatMap((allocation) => allocation.orbitSlots),
		)
		for (const [type, key] of [
			["gas-giant", "gasGiantCount"],
			["belt", "beltCount"],
			["terrestrial", "terrestrialCount"],
		] as const) {
			const accepted = slots.filter(
				(slot) => slot.type === type && slot.anomalousOrbitType === null,
			).length
			expect(system.unplacedWorldTypeCounts[key]).toBeGreaterThanOrEqual(0)
			expect(accepted + system.unplacedWorldTypeCounts[key]).toBe(
				system.worldTypeCounts[key],
			)
		}
	})
})

import { BINARY_ORBIT } from "@/model/celestial/galaxy/systems/binary-orbit"
