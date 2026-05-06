import { describe, expect, it } from "vitest"
import {
	getMapModePrimary,
	getVisibleDemographicModeOptions,
	getVisibleGeographyModeOptions,
	isDebugGeographyMode,
	normalizeGeographyColorMode,
	POLITICAL_MODE_OPTIONS,
} from "./map-modes"

describe("map-modes", () => {
	it("maps color modes to their primary categories", () => {
		expect(getMapModePrimary("terrain")).toBe("geography")
		expect(getMapModePrimary("nations")).toBe("political")
		expect(getMapModePrimary("population")).toBe("demographics")
	})

	it("filters geography options by debug visibility", () => {
		const defaultOptions = getVisibleGeographyModeOptions(false)
		const debugOptions = getVisibleGeographyModeOptions(true)

		expect(defaultOptions.map(([mode]) => mode)).toContain("terrain")
		expect(defaultOptions.map(([mode]) => mode)).not.toContain("dtr")
		expect(debugOptions.map(([mode]) => mode)).toContain("dtr")
		expect(debugOptions.map(([mode]) => mode)).toContain("koppenClimate")
	})

	it("filters demographic options by debug visibility", () => {
		const defaultOptions = getVisibleDemographicModeOptions(false)
		const debugOptions = getVisibleDemographicModeOptions(true)

		expect(defaultOptions.map(([mode]) => mode)).toContain("density")
		expect(debugOptions).toEqual(defaultOptions)
	})

	it("includes dynasty and diplomacy alongside the political submodes", () => {
		expect(POLITICAL_MODE_OPTIONS).toEqual([
			["borders", "Nations"],
			["provinces", "Provinces"],
			["dynasty", "Dynasty"],
			["diplomacy", "Diplomacy"],
		])
	})

	it("identifies debug-only geography modes", () => {
		expect(isDebugGeographyMode("dtr")).toBe(true)
		expect(isDebugGeographyMode("terrain")).toBe(false)
	})

	it("normalizes only unsupported geography modes", () => {
		expect(
			normalizeGeographyColorMode({
				colorMode: "landHeightmap",
				hasHazards: true,
				hasVolcanism: true,
			}),
		).toBe("landHeightmap")
		expect(
			normalizeGeographyColorMode({
				colorMode: "dangerZones",
				hasHazards: false,
				hasVolcanism: true,
			}),
		).toBe("terrain")
		expect(
			normalizeGeographyColorMode({
				colorMode: "hotspots",
				hasHazards: true,
				hasVolcanism: false,
			}),
		).toBe("terrain")
	})
})
