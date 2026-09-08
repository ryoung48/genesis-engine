import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { expect, test } from "vitest"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import type { VplanetReference } from "@/test/earth/vplanet/types"
import type { EbmPreviewConfig } from "@/ui/wiki/climate-preview/types"
import { buildEbmPreview } from "@/ui/wiki/climate-preview/useEbmPreview"

// The default Earth preview inputs (SOL_SYSTEM.solMainWorldDefaults); land
// fraction matches VPLanet POISE's EarthClimate.
const EARTH_LIKE: EbmPreviewConfig = {
	obliquity: 23.44,
	eccentricity: 0.0167,
	perihelion: 102,
	spectralClass: "G",
	starSubtype: 2,
	orbitalDistanceAU: 1,
	hoursPerDay: 23.93447232,
	daysPerYear: 365,
	landFraction: 0.34,
	radius: 6371,
	pressure: 1,
}

test("climate preview reproduces the native VPLanet global mean", () => {
	const reference: VplanetReference = JSON.parse(
		gunzipSync(
			readFileSync("src/test/earth/fixtures/vplanet-earth-climate.json.gz"),
		).toString(),
	)

	const preview = buildEbmPreview(EARTH_LIKE)

	expect(preview.converged).toBe(true)
	expect(preview.yearsRun).toBeGreaterThan(1)

	// Simulated on VPLanet's 150-cell equal-area grid, shown on the coarse grid.
	expect(preview.heat).toHaveLength(CONSTANTS.embConstants.grid.NUM_LAT)
	expect(preview.lats[0]).toBe(-90)
	expect(preview.lats[preview.lats.length - 1]).toBe(90)

	const sampleCount = reference.forcingDay.length
	expect(preview.heat.every((row) => row.length === sampleCount)).toBe(true)
	expect(
		preview.iceMassBalance.every((row) => row.length === sampleCount),
	).toBe(true)
	expect(preview.columnValues).toHaveLength(sampleCount)
	expect(preview.columnLabels[0]).toBe("0")

	// Equal-area cells carry equal weight, so the fixture global mean is the
	// plain mean over every sample; the preview avgTemp is the raw 150-cell
	// area-weighted mean.
	let referenceSum = 0
	let count = 0
	for (let day = 0; day < sampleCount; day++) {
		for (let lat = 0; lat < reference.latitudeDegrees.length; lat++) {
			referenceSum += reference.temperature[day][lat]
			count++
		}
	}
	// Matches the VPLanet fixture within the spread from the default Earth
	// orbital/rotational inputs differing slightly from the pinned preset.
	expect(Math.abs(preview.avgTemp - referenceSum / count)).toBeLessThan(0.5)
})

test("changing obliquity changes the preview", () => {
	const upright = buildEbmPreview({ ...EARTH_LIKE, obliquity: 0 })
	const tilted = buildEbmPreview({ ...EARTH_LIKE, obliquity: 45 })
	expect(upright.avgTemp).not.toBeCloseTo(tilted.avgTemp, 3)
})
