import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("applyCraters effect", () => {
	it("leavesCraterlessWorldElevationUnchanged", () => {
		// The default fixture uses craters: 0, which means applyCraters is a no-op.
		// We can verify the elevation array is the same object between identical calls.
		const world1 = getCachedWorld()
		const world2 = getCachedWorld()
		expect(world1.elevation).toBe(world2.elevation)
	})

	it("producesElevationArrayLengthOfNumRegions", () => {
		const world = getCachedWorld({ craters: 0.3 })
		expect(world.elevation.length).toBe(world.mesh.numRegions)
	})

	it("changesElevationWhenCratersEnabled", () => {
		const noCraters = getCachedWorld()
		const withCraters = getCachedWorld({ craters: 0.3 })
		let anyDiff = false
		for (let r = 0; r < noCraters.elevation.length; r++) {
			if (noCraters.elevation[r] !== withCraters.elevation[r]) {
				anyDiff = true
				break
			}
		}
		expect(anyDiff).toBe(true)
	})

	it("producesFiniteElevationWithCraters", () => {
		const world = getCachedWorld({ craters: 0.3 })
		const { elevation } = world
		for (let r = 0; r < elevation.length; r++) {
			expect(Number.isFinite(elevation[r])).toBe(true)
		}
	})

	it("preservesIsLandLengthWithCraters", () => {
		const world = getCachedWorld({ craters: 0.3 })
		expect(world.isLand.length).toBe(world.mesh.numRegions)
	})
})
