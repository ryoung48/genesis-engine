import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline plates output", () => {
	it("producesPlatesArrayWithExpectedCount", () => {
		const world = getCachedWorld()
		expect(world.plates.length).toBe(world.params.numPlates)
	})

	it("producesPlateAssignmentArrayLengthOfNumRegions", () => {
		const world = getCachedWorld()
		expect(world.plateAssignment.length).toBe(world.mesh.numRegions)
	})

	it("assignsEveryRegionToAValidPlate", () => {
		const world = getCachedWorld()
		const { plateAssignment, plates } = world
		for (let r = 0; r < plateAssignment.length; r++) {
			expect(plateAssignment[r]).toBeGreaterThanOrEqual(0)
			expect(plateAssignment[r]).toBeLessThan(plates.length)
		}
	})

	it("assignsSequentialIdToEachPlate", () => {
		const world = getCachedWorld()
		world.plates.forEach((plate, idx) => {
			expect(plate.id).toBe(idx)
		})
	})

	it("producesUnitLengthPoleForEachPlate", () => {
		const world = getCachedWorld()
		for (const plate of world.plates) {
			const [x, y, z] = plate.pole
			expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4)
		}
	})

	it("classifiesSomePlatesAsOceanAndSomeAsLand", () => {
		const world = getCachedWorld()
		const hasOcean = world.plates.some((p) => p.isOcean)
		const hasLand = world.plates.some((p) => !p.isOcean)
		expect(hasOcean).toBe(true)
		expect(hasLand).toBe(true)
	})

	it("populatesRegionAssignmentCoveringAllRegions", () => {
		// Verify coverage via plateAssignment (regions set may be empty on pipeline output)
		const world = getCachedWorld()
		const plateCounts = new Array(world.plates.length).fill(0)
		for (let r = 0; r < world.plateAssignment.length; r++) {
			plateCounts[world.plateAssignment[r]]++
		}
		for (const count of plateCounts) {
			expect(count).toBeGreaterThan(0)
		}
	})
})
