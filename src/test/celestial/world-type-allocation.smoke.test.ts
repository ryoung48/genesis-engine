import { describe, expect, it } from "vitest"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { WORLD_TYPE_ALLOCATION } from "@/model/celestial/system/generation/world-type-allocation"

describe("World type allocation", () => {
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

	it("allocates every generated system type budget to body-capable stars", () => {
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
		})
		const allocatedTypeWorlds = system.stars.reduce(
			(total, star) =>
				total +
				star.worldTypeAllocation.totalWorlds -
				star.worldTypeAllocation.emptyOrbitCount,
			0,
		)
		expect(allocatedTypeWorlds).toBe(system.worldTypeCounts.totalWorlds)
	})
})
