import { describe, expect, it } from "vitest"
import {
	dangerColor,
	dangerMapColor,
	developmentColor,
	gravityColor,
	hotspotColor,
	migrationColor,
	populationColor,
	precipitationAnnualColor,
	precipitationCssColor,
	precipitationMonthlyColor,
	slopeColor,
	temperatureDeltaColor,
} from "./colors"

function expectRgbCloseTo(
	actual: [number, number, number],
	expected: [number, number, number],
) {
	expect(actual).toHaveLength(expected.length)
	for (let i = 0; i < expected.length; i++) {
		expect(actual[i]).toBeCloseTo(expected[i], 3)
	}
}

describe("precipitation colors", () => {
	it("matches the original monthly stop colors", () => {
		expect(precipitationMonthlyColor(10)).toEqual([0.85, 0.78, 0.45])
		expect(precipitationMonthlyColor(83)).toEqual([0.4, 0.75, 0.45])
		expect(precipitationMonthlyColor(400)).toEqual([0.3, 0.15, 0.7])
	})

	it("uses fixed monthly thresholds without normalization", () => {
		expect(precipitationMonthlyColor(400)).toEqual(
			precipitationMonthlyColor(999),
		)
		expect(precipitationCssColor(400)).not.toBe(precipitationCssColor(200))
	})

	it("uses distinct annual thresholds from monthly precipitation", () => {
		expect(precipitationAnnualColor(120)).toEqual([0.85, 0.78, 0.45])
		expect(precipitationAnnualColor(400)).not.toEqual(
			precipitationMonthlyColor(400),
		)
		expect(precipitationAnnualColor(4_800)).toEqual(
			precipitationMonthlyColor(400),
		)
	})
})

describe("sampled palette colors", () => {
	it("matches the sampled temperature delta endpoints", () => {
		expectRgbCloseTo(temperatureDeltaColor(0), [1, 1, 0.8])
		expectRgbCloseTo(temperatureDeltaColor(60), [0.502, 0, 0.149])
	})

	it("matches the shared ramps", () => {
		expectRgbCloseTo(dangerColor(0), [0.937, 0.965, 1])
		expectRgbCloseTo(hotspotColor(1), [1, 0.969, 0.929])
		expectRgbCloseTo(populationColor(1), [0.498, 0.153, 0.016])
		expectRgbCloseTo(migrationColor(1), [0.882, 0.286, 0.224])
		expectRgbCloseTo(gravityColor(1), [0.725, 0.11, 0.11])
		expectRgbCloseTo(developmentColor(1), [0.302, 0, 0.294])
		expectRgbCloseTo(slopeColor(1), [0.498, 0.114, 0.114])
	})

	it("maps danger zones from white to orange for earthquakes and red for volcanoes", () => {
		expectRgbCloseTo(dangerMapColor(0.1, 0.1), [1, 1, 1])
		expectRgbCloseTo(
			dangerMapColor(0.3, 0.1),
			[0.9984, 0.9749333333333333, 0.9404],
		)
		expectRgbCloseTo(dangerMapColor(0.1, 0.4), [0.9844, 0.865, 0.8266])
		expectRgbCloseTo(dangerMapColor(0.1, 1), [0.922, 0.325, 0.133])
	})
})
