import { describe, expect, it } from "vitest"
import {
	formatArea,
	formatDensity,
	formatDistance,
	formatElevation,
	formatFlowRate,
	formatPrecipitation,
	formatTemperature,
	formatTemperatureDelta,
	rgbToCss,
} from "./ui-format"

describe("ui-format", () => {
	it("formats rgb tuples and temperatures for display", () => {
		expect(rgbToCss([0.1, 0.5, 0.9])).toBe("rgb(26, 128, 230)")
		expect(rgbToCss([1, 0, 0.25])).toBe("rgb(255, 0, 64)")
		expect(formatTemperature(12.34, "metric")).toBe("12.3 °C")
		expect(formatTemperature(12.34, "imperial")).toBe("54.2 °F")
		expect(formatTemperatureDelta(-3.2, "metric", 0)).toBe("-3 °C")
		expect(formatTemperatureDelta(-3.2, "imperial", 1)).toBe("-5.8 °F")
		expect(formatElevation(1.5, "metric")).toBe("1.50 km")
		expect(formatElevation(1.5, "imperial")).toBe("4.9k ft")
		expect(formatElevation(0.01, "imperial")).toBe("33 ft")
		expect(formatElevation(0.305, "imperial")).toBe("1k ft")
		expect(formatElevation(3.05, "imperial")).toBe("10k ft")
		expect(formatElevation(305, "imperial")).toBe("1M ft")
		expect(formatElevation(3050, "imperial")).toBe("10M ft")
		expect(formatElevation(-1.5, "imperial")).toBe("-4.9k ft")
		expect(formatElevation(-0.01, "imperial")).toBe("-33 ft")
		expect(formatDistance(42, "metric", { under100Digits: 1 })).toBe("42.0 km")
		expect(formatDistance(42, "imperial", { under100Digits: 1 })).toBe(
			"26.1 mi",
		)
		expect(formatPrecipitation(25, "metric")).toBe("25 mm")
		expect(formatPrecipitation(25, "imperial")).toBe("1.0 in")
		expect(formatDensity(10, "metric")).toBe("10.0/km²")
		expect(formatDensity(10, "imperial")).toBe("25.9/mi²")
		expect(formatArea(1_500, "metric", { digits: 1, compact: "k" })).toBe(
			"1.5k km²",
		)
		expect(formatArea(1_500_000, "imperial", { digits: 1, compact: "M" })).toBe(
			"0.6M mi²",
		)
		expect(formatFlowRate(12.5, "metric", (value) => value.toFixed(1))).toBe(
			"12.5 m³/s",
		)
		expect(formatFlowRate(12.5, "imperial", (value) => value.toFixed(1))).toBe(
			"441.4 ft³/s",
		)
	})
})
