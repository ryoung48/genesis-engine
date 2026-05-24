import { describe, expect, it } from "vitest"
import { canHandlePlanetClick } from "./measurement-click"

describe("canHandlePlanetClick", () => {
	it("allows ruler clicks without province or nation data", () => {
		expect(
			canHandlePlanetClick("ruler", {
				hasWorld: true,
				hasProvinces: false,
				hasNationModel: false,
			}),
		).toBe(true)
	})

	it("still blocks selection clicks when province or nation data is missing", () => {
		expect(
			canHandlePlanetClick("off", {
				hasWorld: true,
				hasProvinces: false,
				hasNationModel: true,
			}),
		).toBe(false)
		expect(
			canHandlePlanetClick("off", {
				hasWorld: true,
				hasProvinces: true,
				hasNationModel: false,
			}),
		).toBe(false)
	})

	it("rejects clicks when there is no world to inspect", () => {
		expect(
			canHandlePlanetClick("ruler", {
				hasWorld: false,
				hasProvinces: false,
				hasNationModel: false,
			}),
		).toBe(false)
	})
})
