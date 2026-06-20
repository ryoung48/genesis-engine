import { describe, expect, it } from "vitest"
import {
	getMapModePrimary,
	getVisibleGeographyModeOptions,
	getVisibleSocietyModeOptions,
	isDebugGeographyMode,
	normalizeGeographyColorMode,
} from "./map-modes"

describe("map-modes", () => {
	it("maps color modes to their primary categories", () => {
		expect(getMapModePrimary("terrain")).toBe("geography")
		expect(getMapModePrimary("nations")).toBe("society")
		expect(getMapModePrimary("population")).toBe("society")
		expect(getMapModePrimary("timezone")).toBe("society")
	})

	it("filters geography options by debug visibility", () => {
		const defaultOptions = getVisibleGeographyModeOptions(false)
		const debugOptions = getVisibleGeographyModeOptions(true)

		expect(defaultOptions.map(([mode]) => mode)).toContain("terrain")
		expect(defaultOptions.map(([mode]) => mode)).not.toContain("basins")
		expect(defaultOptions.map(([mode]) => mode)).not.toContain("pastaClimate")
		expect(debugOptions.map(([mode]) => mode)).toContain("basins")
		expect(debugOptions.map(([mode]) => mode)).not.toContain("pastaClimate")
		expect(debugOptions.map(([mode]) => mode)).not.toContain("koppenClimate")
	})

	it("filters society options by debug visibility", () => {
		const defaultOptions = getVisibleSocietyModeOptions(false)
		const debugOptions = getVisibleSocietyModeOptions(true)

		expect(defaultOptions.map(([mode]) => mode)).toContain("borders")
		expect(defaultOptions.map(([mode]) => mode)).toContain("density")
		expect(defaultOptions.map(([mode]) => mode)).toContain("timezone")
		expect(defaultOptions.map(([mode]) => mode)).not.toContain("migration")
		expect(defaultOptions.map(([mode]) => mode)).not.toContain("provinces")
		expect(debugOptions.map(([mode]) => mode)).toContain("migration")
		expect(debugOptions.map(([mode]) => mode)).toContain("provinces")
	})

	it("identifies debug-only geography modes", () => {
		expect(isDebugGeographyMode("basins")).toBe(true)
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
