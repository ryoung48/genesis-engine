import { describe, expect, it } from "vitest"
import { SEABED_HABITAT } from "@/model/geography/terrain/seabed/habitat"
import type { SeabedHabitatOfParams } from "@/model/geography/terrain/seabed/habitat/types"
import { SHORE_MATERIAL } from "@/model/geography/terrain/shore/material"

const MATERIAL = SHORE_MATERIAL.code
const CODE = SEABED_HABITAT.habitatCode

const BASE: SeabedHabitatOfParams = {
	substrate: MATERIAL.rock,
	coldestC: 22,
	warmestC: 29,
	iceMonths: 0,
	leeM: 0.5,
}

function habitatOf(overrides: Partial<SeabedHabitatOfParams>) {
	return SEABED_HABITAT.habitats[
		SEABED_HABITAT.habitatOf({ ...BASE, ...overrides })
	]
}

describe("seabed habitat rules", () => {
	it("warm water grows coral on rock, sand and gravel but not mud", () => {
		expect(habitatOf({})).toBe("coral")
		expect(habitatOf({ substrate: MATERIAL.sand })).toBe("coral")
		expect(habitatOf({ substrate: MATERIAL.gravel })).toBe("coral")
		expect(habitatOf({ substrate: MATERIAL.mud })).toBe("seagrass")
	})

	it("the coral edge is a coldest month of 18 degrees", () => {
		expect(habitatOf({ coldestC: 18, warmestC: 26 })).toBe("coral")
		expect(habitatOf({ coldestC: 17.9, warmestC: 26 })).toBe("rockyReef")
	})

	it("cool water on rock or gravel grows kelp", () => {
		const cool = { coldestC: 4, warmestC: 14 }
		expect(habitatOf(cool)).toBe("kelp")
		expect(habitatOf({ ...cool, substrate: MATERIAL.gravel })).toBe("kelp")
		expect(habitatOf({ ...cool, warmestC: 20 })).toBe("kelp")
		expect(habitatOf({ ...cool, warmestC: 20.1 })).toBe("rockyReef")
	})

	it("coral wins over kelp where a whole year sits between 18 and 20 degrees", () => {
		expect(habitatOf({ coldestC: 18, warmestC: 19.5 })).toBe("coral")
	})

	it("too many ice months stops kelp and seagrass", () => {
		const cool = { coldestC: -1.8, warmestC: 6 }
		expect(habitatOf({ ...cool, iceMonths: 6 })).toBe("kelp")
		expect(habitatOf({ ...cool, iceMonths: 7 })).toBe("rockyReef")
		expect(habitatOf({ ...cool, iceMonths: 7, substrate: MATERIAL.sand })).toBe(
			"none",
		)
	})

	it("seagrass needs soft ground and a sheltered lee", () => {
		const soft = { substrate: MATERIAL.sand, coldestC: 8, warmestC: 22 }
		expect(habitatOf(soft)).toBe("seagrass")
		expect(habitatOf({ ...soft, substrate: MATERIAL.mud })).toBe("seagrass")
		expect(habitatOf({ ...soft, leeM: 1.5 })).toBe("seagrass")
		expect(habitatOf({ ...soft, leeM: 1.6 })).toBe("none")
	})

	it("ice substrate carries nothing and gravel carries no seagrass", () => {
		expect(habitatOf({ substrate: MATERIAL.ice })).toBe("none")
		expect(
			habitatOf({ substrate: MATERIAL.gravel, coldestC: 8, warmestC: 22 }),
		).toBe("none")
	})

	it("classify skips cells under the minimum share and reads each cell's own climate", () => {
		const numRegions = 3
		const temperatureMonthly = new Float32Array(12 * numRegions)
		const mean = [24, 4, 24]
		for (let m = 0; m < 12; m++)
			for (let r = 0; r < numRegions; r++)
				temperatureMonthly[m * numRegions + r] = mean[r]
		const habitat = SEABED_HABITAT.classify({
			numRegions,
			source: Int32Array.from([2, 2, 2]),
			share: Uint8Array.from([50, 50, 1]),
			substrate: Uint8Array.from([MATERIAL.rock, MATERIAL.rock, MATERIAL.rock]),
			exposureLeeM: new Float32Array(numRegions),
			temperatureMonthly,
			iceMinMonthly: new Float32Array(numRegions),
			iceMaxMonthly: new Float32Array(numRegions),
		})
		expect(Array.from(habitat)).toEqual([CODE.coral, CODE.kelp, CODE.none])
	})

	it("classify counts months with sea ice", () => {
		const temperatureMonthly = new Float32Array(12).fill(-2)
		const classifyWith = ({
			iceMax,
			iceMin,
		}: {
			iceMax: number
			iceMin: number
		}) =>
			SEABED_HABITAT.classify({
				numRegions: 1,
				source: Int32Array.from([0]),
				share: Uint8Array.from([50]),
				substrate: Uint8Array.from([MATERIAL.sand]),
				exposureLeeM: new Float32Array(1),
				temperatureMonthly,
				iceMinMonthly: Float32Array.from([iceMin]),
				iceMaxMonthly: Float32Array.from([iceMax]),
			})[0]
		expect(classifyWith({ iceMax: 0, iceMin: 0 })).toBe(CODE.seagrass)
		expect(classifyWith({ iceMax: 1, iceMin: 0 })).toBe(CODE.none)
		expect(classifyWith({ iceMax: 1, iceMin: 1 })).toBe(CODE.none)
	})
})
