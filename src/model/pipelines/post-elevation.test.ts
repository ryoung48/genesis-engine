import { describe, expect, it } from "vitest"
import type { GenesisRainfall } from ".."
import {
	LANDMARK_TYPE_LAKE,
	LANDMARK_TYPE_OCEAN,
	type GenesisLandmarks,
} from "../terrain/landmarks"
import { reconcileClosedWaterBodies } from "./post-elevation"

describe("reconcileClosedWaterBodies", () => {
	it("drains dry closed-water lakes back to land and river land", () => {
		const isLand = new Uint8Array([1, 0, 0, 0])
		const riverLand = new Uint8Array([1, 0, 0, 0])
		const landmarks = {
			regionLandmark: new Int32Array([0, 1, 1, 2]),
			type: new Uint8Array([0, LANDMARK_TYPE_LAKE, LANDMARK_TYPE_OCEAN]),
			count: 3,
		} as Pick<GenesisLandmarks, "regionLandmark" | "type" | "count">
		const rainfall = {
			annual: new Float32Array([0, 40, 60, 500]),
		} as Pick<GenesisRainfall, "annual">

		const changed = reconcileClosedWaterBodies({
			isLand,
			riverLand,
			landmarks,
			rainfall,
		})

		expect(changed).toBe(true)
		expect(Array.from(isLand)).toEqual([1, 1, 1, 0])
		expect(Array.from(riverLand)).toEqual([1, 1, 1, 0])
	})

	it("keeps wet closed-water lakes as water for later lake promotion", () => {
		const isLand = new Uint8Array([1, 0, 0, 0])
		const riverLand = new Uint8Array([1, 0, 0, 0])
		const landmarks = {
			regionLandmark: new Int32Array([0, 1, 1, 2]),
			type: new Uint8Array([0, LANDMARK_TYPE_LAKE, LANDMARK_TYPE_OCEAN]),
			count: 3,
		} as Pick<GenesisLandmarks, "regionLandmark" | "type" | "count">
		const rainfall = {
			annual: new Float32Array([0, 120, 180, 500]),
		} as Pick<GenesisRainfall, "annual">

		const changed = reconcileClosedWaterBodies({
			isLand,
			riverLand,
			landmarks,
			rainfall,
		})

		expect(changed).toBe(false)
		expect(Array.from(isLand)).toEqual([1, 0, 0, 0])
		expect(Array.from(riverLand)).toEqual([1, 0, 0, 0])
	})
})
