import { describe, expect, it } from "vitest"
import { WETLANDS } from "@/model/geography/terrain/groundwater/wetlands"
import { SHORE } from "@/model/geography/terrain/shore"
import { SHORE_MATERIAL } from "@/model/geography/terrain/shore/material"
import { SHORE_RELIEF } from "@/model/geography/terrain/shore/relief"
import { SHORE_SETTING } from "@/model/geography/terrain/shore/setting"
import type {
	HabitatOfParams,
	LabelOfParams,
} from "@/model/geography/terrain/shore/types"

const HABITAT_CODE = SHORE.habitatCode
const MATERIAL = SHORE_MATERIAL.code
const RELIEF = SHORE_RELIEF.code

const HABITAT: HabitatOfParams = {
	isIce: false,
	wetlandKind: WETLANDS.code.mangrove,
	coastFlag: 1,
	wetCoast: 0.2,
	leeClass: 2,
	relief: RELIEF.low,
	sandShare: 70,
	tidalRangeM: 1,
}

const LABEL: LabelOfParams = {
	material: MATERIAL.sand,
	volcanicSand: false,
	relief: RELIEF.sloping,
	openClass: 2,
	habitat: HABITAT_CODE.none,
	setting: SHORE_SETTING.code.none,
}

function habitatOf(overrides: Partial<HabitatOfParams>) {
	return SHORE.habitatOf({ ...HABITAT, ...overrides })
}

function labelOf(overrides: Partial<LabelOfParams>) {
	return SHORE.labels[SHORE.labelOf({ ...LABEL, ...overrides })]
}

describe("shore habitat", () => {
	it("coast-caused mangrove and salt marsh need a visible coastal share", () => {
		expect(habitatOf({})).toBe(HABITAT_CODE.mangrove)
		expect(habitatOf({ wetlandKind: WETLANDS.code.coastalSaltMarsh })).toBe(
			HABITAT_CODE.saltMarsh,
		)
		expect(habitatOf({ wetCoast: 0.04 })).toBe(HABITAT_CODE.none)
		expect(habitatOf({ coastFlag: 0 })).toBe(HABITAT_CODE.none)
	})

	it("other wetland kinds do not become shore habitat", () => {
		expect(habitatOf({ wetlandKind: WETLANDS.code.floodplain })).toBe(
			HABITAT_CODE.none,
		)
	})

	it("tidal flats need a sheltered low muddy macrotidal coast", () => {
		const flat = { wetlandKind: 0, sandShare: 30, tidalRangeM: 3, leeClass: 1 }
		expect(habitatOf(flat)).toBe(HABITAT_CODE.tidalFlat)
		expect(habitatOf({ ...flat, leeClass: 2 })).toBe(HABITAT_CODE.none)
		expect(habitatOf({ ...flat, tidalRangeM: 1 })).toBe(HABITAT_CODE.none)
		expect(habitatOf({ ...flat, sandShare: 60 })).toBe(HABITAT_CODE.none)
		expect(habitatOf({ ...flat, relief: RELIEF.sloping })).toBe(
			HABITAT_CODE.none,
		)
	})

	it("ice coasts have no habitat", () => {
		expect(habitatOf({ isIce: true })).toBe(HABITAT_CODE.none)
	})
})

describe("shore label", () => {
	it("follows the documented priority", () => {
		expect(
			labelOf({ material: MATERIAL.ice, habitat: HABITAT_CODE.mangrove }),
		).toBe("iceCoast")
		expect(
			labelOf({
				habitat: HABITAT_CODE.mangrove,
				setting: SHORE_SETTING.code.delta,
			}),
		).toBe("mangroveCoast")
		expect(labelOf({ habitat: HABITAT_CODE.saltMarsh })).toBe("saltMarshCoast")
		expect(
			labelOf({
				habitat: HABITAT_CODE.tidalFlat,
				setting: SHORE_SETTING.code.delta,
			}),
		).toBe("tidalFlat")
		expect(
			labelOf({ setting: SHORE_SETTING.code.delta, relief: RELIEF.steep }),
		).toBe("deltaCoast")
		expect(labelOf({ relief: RELIEF.steep, material: MATERIAL.rock })).toBe(
			"cliff",
		)
	})

	it("a flagged volcanic coast is black sand whatever its material or relief", () => {
		expect(labelOf({ volcanicSand: true })).toBe("blackSandBeach")
		expect(
			labelOf({
				volcanicSand: true,
				material: MATERIAL.rock,
				relief: RELIEF.steep,
			}),
		).toBe("blackSandBeach")
		expect(labelOf({ volcanicSand: true, material: MATERIAL.ice })).toBe(
			"iceCoast",
		)
		expect(
			labelOf({ volcanicSand: true, setting: SHORE_SETTING.code.delta }),
		).toBe("deltaCoast")
	})

	it("a steep soft coast is a gravel beach, not a cliff", () => {
		expect(labelOf({ relief: RELIEF.steep, material: MATERIAL.gravel })).toBe(
			"gravelBeach",
		)
	})

	it("a steep sheltered coast is not a cliff", () => {
		expect(
			labelOf({ relief: RELIEF.steep, openClass: 0, material: MATERIAL.rock }),
		).toBe("rockyShore")
	})

	it("falls through to the material", () => {
		expect(labelOf({ material: MATERIAL.rock })).toBe("rockyShore")
		expect(labelOf({ material: MATERIAL.gravel })).toBe("gravelBeach")
		expect(labelOf({})).toBe("sandyBeach")
		expect(labelOf({ volcanicSand: true })).toBe("blackSandBeach")
		expect(labelOf({ material: MATERIAL.mud })).toBe("muddyShore")
	})

	it("label codes are unique with none first", () => {
		expect(new Set(SHORE.labels).size).toBe(SHORE.labels.length)
		expect(SHORE.labels[0]).toBe("none")
		expect(SHORE.labels).toHaveLength(12)
	})
})
