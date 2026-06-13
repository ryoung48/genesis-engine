import { describe, expect, it } from "vitest"
import { buildMapExportFilename, syncLabelModeToMapMode } from "./GenesisView"

describe("buildMapExportFilename", () => {
	it("uses the current planet code when present", () => {
		expect(
			buildMapExportFilename(
				"AB_cd:12",
				4096,
				new Date("2026-05-24T12:00:00Z"),
			),
		).toBe("genesis-map-ab-cd-12-4096w.png")
	})

	it("falls back to a timestamp when there is no planet code", () => {
		expect(
			buildMapExportFilename("", 2048, new Date("2026-05-24T12:34:56.789Z")),
		).toBe("genesis-map-2026-05-24T12-34-56-789Z-2048w.png")
	})
})

describe("syncLabelModeToMapMode", () => {
	it("falls back to political labels for unsupported demographic submodes", () => {
		expect(
			syncLabelModeToMapMode({
				labelMode: {
					nations: false,
					dynasty: false,
					settlements: true,
					culture: true,
					heritage: false,
					faith: false,
					religion: false,
				},
				colorMode: "population",
				nationMode: "borders",
				populationMode: "development",
			}),
		).toEqual({
			nations: true,
			dynasty: false,
			settlements: true,
			culture: false,
			heritage: false,
			faith: false,
			religion: false,
		})
	})

	it("remaps active labels to the supported demographic label for the current mode", () => {
		expect(
			syncLabelModeToMapMode({
				labelMode: {
					nations: true,
					dynasty: false,
					settlements: false,
					culture: false,
					heritage: false,
					faith: false,
					religion: false,
				},
				colorMode: "population",
				nationMode: "borders",
				populationMode: "faith",
			}),
		).toEqual({
			nations: false,
			dynasty: false,
			settlements: false,
			culture: false,
			heritage: false,
			faith: true,
			religion: false,
		})
	})
})
