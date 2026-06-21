import { describe, expect, it } from "vitest"
import {
	DEFAULT_VIEW_PREFS,
	parseStoredViewPrefs,
	serializeStoredViewPrefs,
} from "./view-prefs"

describe("view-prefs", () => {
	it("round-trips valid persisted preferences", () => {
		const stored = serializeStoredViewPrefs({
			...DEFAULT_VIEW_PREFS,
			colorMode: "nations",
			geographyMode: "climate",
			nationMode: "dynasty",
			populationMode: "religion",
			viewMode: "map",
			showGrid: false,
			showOceanCurrents: true,
			showRivers: true,
			showInfrastructure: true,
			overlaysExpanded: true,
			gridSpacing: 30,
			unitSystem: "imperial",
			mapProjectionLatitude: 22.5,
			debugMapModes: true,
		})

		expect(parseStoredViewPrefs(stored)).toEqual({
			...DEFAULT_VIEW_PREFS,
			colorMode: "nations",
			geographyMode: "climate",
			nationMode: "dynasty",
			populationMode: "religion",
			viewMode: "map",
			showGrid: false,
			showOceanCurrents: true,
			showRivers: true,
			showInfrastructure: true,
			overlaysExpanded: true,
			gridSpacing: 30,
			unitSystem: "imperial",
			mapProjectionLatitude: 22.5,
			debugMapModes: true,
		})
	})

	it("falls back to defaults for invalid persisted values", () => {
		const stored = JSON.stringify({
			colorMode: "wrong",
			geographyMode: "bad",
			nationMode: "nope",
			populationMode: "bad",
			viewMode: "sideways",
			showGrid: "yes",
			gridSpacing: "15",
			unitSystem: "kelvin",
			mapProjectionLatitude: null,
		})

		expect(parseStoredViewPrefs(stored)).toEqual(DEFAULT_VIEW_PREFS)
	})

	it("returns null for malformed storage payloads", () => {
		expect(parseStoredViewPrefs("{oops")).toBeNull()
		expect(parseStoredViewPrefs(null)).toBeNull()
	})
})
