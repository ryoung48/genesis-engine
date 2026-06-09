import { describe, expect, it } from "vitest"
import {
	climateTempColor,
	climateZoneColor,
	dangerColor,
	dangerMapColor,
	daylightColor,
	developmentColor,
	dtrColor,
	getColor,
	hotspotColor,
	migrationColor,
	moistureDirectionalColor,
	OCEAN_LIGHT_BLUE,
	oceanCurrentColor,
	populationColor,
	precipitationAnnualColor,
	precipitationCssColor,
	precipitationMonthlyColor,
	slopeColor,
	temperatureColor,
	temperatureDeltaColor,
	vegetationColor,
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

	it("matches the shared daylight and temperature ramps", () => {
		expectRgbCloseTo(daylightColor(24), [0.988, 0.984, 0.992])
		expectRgbCloseTo(daylightColor(0), [0.247, 0, 0.49])
		expectRgbCloseTo(temperatureColor(-73), [0.973, 0.984, 1])
		expectRgbCloseTo(temperatureColor(80), [0.353, 0, 0.184])
	})

	it("matches the shared ramps", () => {
		expectRgbCloseTo(dangerColor(0), [0.937, 0.965, 1])
		expectRgbCloseTo(hotspotColor(1), [1, 0.969, 0.929])
		expectRgbCloseTo(populationColor(1), [0.498, 0.153, 0.016])
		expectRgbCloseTo(migrationColor(1), [0.882, 0.286, 0.224])
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

	it("covers the terrain helper modes and palette fallbacks", () => {
		const terrainOcean = getColor(-10, "terrain")

		expect(terrainOcean[2]).toBeGreaterThan(terrainOcean[0])
		expectRgbCloseTo(getColor(6, "terrain"), [0.961, 0.957, 0.949])
		expectRgbCloseTo(getColor(-1, "landHeightmap"), [0, 0, 0])
		expectRgbCloseTo(getColor(3, "landHeightmap"), [0.5, 0.5, 0.5])
		expectRgbCloseTo(getColor(0.25, "slope"), slopeColor(0.25))
		expect(climateZoneColor(99)).toEqual(OCEAN_LIGHT_BLUE)
		expect(vegetationColor(99)).toEqual(OCEAN_LIGHT_BLUE)
	})

	it("interpolates intermediate climate, moisture, current, and dtr values", () => {
		expectRgbCloseTo(moistureDirectionalColor(0.5, false), [0.54, 0.86, 0.6])
		expectRgbCloseTo(climateTempColor(20), [1, 0.655, 0.357])
		expectRgbCloseTo(oceanCurrentColor(0.25), [0.98125, 0.6625, 0.54375])
		expectRgbCloseTo(dtrColor(22.5), [1, 0.904, 0])
		expectRgbCloseTo(temperatureColor(Number.NaN), temperatureColor(80))
		expectRgbCloseTo(climateTempColor(Number.NaN), climateTempColor(40))
		expectRgbCloseTo(oceanCurrentColor(Number.NaN), oceanCurrentColor(1))
		expectRgbCloseTo(dtrColor(Number.NaN), dtrColor(40))
	})
})
