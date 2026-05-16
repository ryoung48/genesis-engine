import { describe, expect, it } from "vitest"
import { getRegionFocusTargets } from "./focus"

describe("getRegionFocusTargets", () => {
	it("returns normalized globe and map targets for a valid region", () => {
		const targets = getRegionFocusTargets({
			meshXYZ: new Float32Array([2, 0, 0, 0, 3, 0]),
			numRegions: 2,
			region: 1,
			centerLongitudeDeg: 0,
			projectionLatitudeDeg: 0,
			mapOffsetX: 1,
			mapOffsetY: 2,
			minDistance: 0.5,
		})

		expect(targets?.globeTarget).toEqual([0, 1.8, 0])
		expect(targets?.mapToX).toBe(2)
		expect(targets?.mapToY).toBe(2)
		expect(targets?.mapToZoom).toBe(6)
	})

	it("returns null for invalid or zero-length regions", () => {
		expect(
			getRegionFocusTargets({
				meshXYZ: new Float32Array([0, 0, 0]),
				numRegions: 1,
				region: 0,
				centerLongitudeDeg: 0,
				projectionLatitudeDeg: 0,
				mapOffsetX: 0,
				mapOffsetY: 0,
				minDistance: 1,
			}),
		).toBeNull()
		expect(
			getRegionFocusTargets({
				meshXYZ: new Float32Array([1, 0, 0]),
				numRegions: 1,
				region: 2,
				centerLongitudeDeg: 0,
				projectionLatitudeDeg: 0,
				mapOffsetX: 0,
				mapOffsetY: 0,
				minDistance: 1,
			}),
		).toBeNull()
	})
})
