import { describe, expect, it } from "vitest"
import { buildLockedClimatePreview } from "./useLockedClimatePreview"

describe("buildLockedClimatePreview", () => {
	it("builds a longitude-by-day preview for tidally locked climates", () => {
		const preview = buildLockedClimatePreview({
			obliquity: 0,
			eccentricity: 0,
			perihelion: 0,
			spectralClass: "G",
			starSubtype: 2,
			orbitalDistanceAU: 1.0,
			hoursPerDay: 24,
			daysPerYear: 30,
			radius: 6371,
			pressure: 1,
			planetRadiusKm: 6371,
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

	it("reduces equatorial substellar insolation when locked obliquity is tilted", () => {
		const equatorial = buildLockedClimatePreview({
			obliquity: 0,
			eccentricity: 0,
			perihelion: 0,
			spectralClass: "G",
			starSubtype: 2,
			orbitalDistanceAU: 1.0,
			hoursPerDay: 24,
			daysPerYear: 30,
			radius: 6371,
			pressure: 1,
			planetRadiusKm: 6371,
			antistellarLon: 180,
		})
		const tilted = buildLockedClimatePreview({
			obliquity: 60,
			eccentricity: 0,
			perihelion: 0,
			spectralClass: "G",
			starSubtype: 2,
			orbitalDistanceAU: 1.0,
			hoursPerDay: 24,
			daysPerYear: 30,
			radius: 6371,
			pressure: 1,
			planetRadiusKm: 6371,
			antistellarLon: 180,
		})

		const substellarIndex = equatorial.longitudes.indexOf(0)
		expect(tilted.insolation[substellarIndex][0]).toBeLessThan(
			equatorial.insolation[substellarIndex][0],
		)
	})
})
