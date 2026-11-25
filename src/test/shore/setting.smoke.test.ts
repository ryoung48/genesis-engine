import { describe, expect, it } from "vitest"
import { SHORE_RELIEF } from "@/model/geography/terrain/shore/relief"
import { SHORE_SETTING } from "@/model/geography/terrain/shore/setting"
import type { SettingOfParams } from "@/model/geography/terrain/shore/setting/types"

const CODE = SHORE_SETTING.code
const BASE: SettingOfParams = {
	relief: SHORE_RELIEF.code.sloping,
	flowM3s: 0,
	tidalRangeM: 0,
	glaciated: false,
	leeClass: 2,
}

function settingOf(overrides: Partial<SettingOfParams>) {
	return SHORE_SETTING.settingOf({ ...BASE, ...overrides })
}

describe("shore setting", () => {
	it("a big river on a low coast is a delta", () => {
		const low = SHORE_RELIEF.code.low
		expect(settingOf({ relief: low, flowM3s: 500 })).toBe(CODE.delta)
		expect(settingOf({ relief: low, flowM3s: 499 })).toBe(CODE.none)
	})

	it("a river into a macrotidal sea is an estuary", () => {
		expect(settingOf({ flowM3s: 100, tidalRangeM: 3 })).toBe(CODE.estuary)
		expect(settingOf({ flowM3s: 100, tidalRangeM: 1 })).toBe(CODE.none)
	})

	it("a delta outranks an estuary", () => {
		expect(
			settingOf({
				relief: SHORE_RELIEF.code.low,
				flowM3s: 800,
				tidalRangeM: 4,
			}),
		).toBe(CODE.delta)
	})

	it("glaciated steep sheltered coasts are fjords", () => {
		const fjord = {
			glaciated: true,
			relief: SHORE_RELIEF.code.steep,
			leeClass: 0,
		}
		expect(settingOf(fjord)).toBe(CODE.fjord)
		expect(settingOf({ ...fjord, leeClass: 2 })).toBe(CODE.none)
		expect(settingOf({ ...fjord, glaciated: false })).toBe(CODE.none)
	})
})
