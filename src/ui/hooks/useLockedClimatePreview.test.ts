import { describe, expect, it } from "vitest"
import { buildLockedClimatePreview } from "./useLockedClimatePreview"

describe("buildLockedClimatePreview", () => {
	it("builds a longitude-by-day preview for tidally locked climates", () => {
		const preview = buildLockedClimatePreview({
			eccentricity: 0,
			perihelion: 0,
			tSun: 5778,
			insolationFactor: 1,
			hoursPerDay: 24,
			daysPerYear: 30,
			radius: 6371,
			pressure: 1,
			planetRadiusKm: 6371,
			sunTempFactor: 1,
			antistellarLon: 180,
		})

		expect(preview.longitudes[0]).toBe(-180)
		expect(preview.columnValues.slice(0, 3)).toEqual([0, 10, 20])
		expect(preview.columnValues.at(-1)).toBe(360)
		expect(preview.columnLabels.slice(0, 3)).toEqual(["0", "10", "20"])
		expect(preview.columnLabels.at(-1)).toBe("360")
		expect(preview.heat[0]).toHaveLength(365)

		const substellarIndex = preview.longitudes.indexOf(0)
		const antistellarIndex = preview.longitudes.indexOf(-180)
		expect(preview.daylight[substellarIndex][0]).toBe(24)
		expect(preview.daylight[antistellarIndex][0]).toBe(0)
		expect(preview.insolation[substellarIndex][0]).toBeGreaterThan(0)
		expect(preview.insolation[antistellarIndex][0]).toBe(0)
		expect(preview.heat[substellarIndex][0]).toBeGreaterThan(
			preview.heat[antistellarIndex][0],
		)
	})
})
