import { describe, expect, it } from "vitest"
import type { OrogenRainfall } from "../types"
import { computeDiurnalRange } from "./dtr"

const PARAMS = { hoursPerDay: 24, pressure: 1.0, tidallyLocked: false as const }

function makeDaylightHours(N: number, hoursPerDay = 24): Float32Array {
	return new Float32Array(12 * N).fill(hoursPerDay / 2)
}

function makeRainfall(N: number, mmPerMonth = 50): OrogenRainfall {
	return {
		monthly: new Float32Array(12 * N).fill(mmPerMonth),
		annual: new Float32Array(N).fill(mmPerMonth * 12),
		east: new Float32Array(N),
		west: new Float32Array(N),
	}
}

describe("computeDiurnalRange", () => {
	it("producesMonthlyArrayOfTwelveTimesN", () => {
		const N = 4
		const result = computeDiurnalRange(
			makeRainfall(N),
			new Float32Array(N),
			new Float32Array(N).fill(500),
			new Uint8Array(N).fill(1),
			PARAMS,
			makeDaylightHours(N),
		)
		expect(result.monthly.length).toBe(12 * N)
	})

	it("producesAnnualArrayOfN", () => {
		const N = 4
		const result = computeDiurnalRange(
			makeRainfall(N),
			new Float32Array(N),
			new Float32Array(N).fill(500),
			new Uint8Array(N).fill(1),
			PARAMS,
			makeDaylightHours(N),
		)
		expect(result.annual.length).toBe(N)
	})

	it("producesNonNegativeDtrForLandCells", () => {
		const N = 4
		const isLand = new Uint8Array(N).fill(1)
		const result = computeDiurnalRange(
			makeRainfall(N),
			new Float32Array(N),
			new Float32Array(N).fill(500),
			isLand,
			PARAMS,
			makeDaylightHours(N),
		)
		for (let i = 0; i < result.monthly.length; i++) {
			expect(result.monthly[i]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesNonNegativeDtrForOceanCells", () => {
		const N = 4
		const isLand = new Uint8Array(N) // all ocean
		const result = computeDiurnalRange(
			makeRainfall(N),
			new Float32Array(N),
			undefined,
			isLand,
			PARAMS,
			makeDaylightHours(N),
		)
		for (let i = 0; i < result.monthly.length; i++) {
			expect(result.monthly[i]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesAnnualEqualToMeanOfMonthlyForEachCell", () => {
		const N = 3
		const result = computeDiurnalRange(
			makeRainfall(N),
			new Float32Array(N),
			new Float32Array(N).fill(500),
			new Uint8Array(N).fill(1),
			PARAMS,
			makeDaylightHours(N),
		)
		for (let r = 0; r < N; r++) {
			let sum = 0
			for (let m = 0; m < 12; m++) sum += result.monthly[m * N + r]
			expect(result.annual[r]).toBeCloseTo(sum / 12, 4)
		}
	})

	it("producesLowerDtrForOceanCellsThanLandCellsWithSameRain", () => {
		const N = 2
		const rain = makeRainfall(N, 50)
		const elevationKm = new Float32Array(N)
		const oceanDist = new Float32Array(N).fill(500)
		const daylight = makeDaylightHours(N)

		const landResult = computeDiurnalRange(
			rain,
			elevationKm,
			oceanDist,
			new Uint8Array(N).fill(1), // all land
			PARAMS,
			daylight,
		)
		const oceanResult = computeDiurnalRange(
			rain,
			elevationKm,
			oceanDist,
			new Uint8Array(N), // all ocean
			PARAMS,
			daylight,
		)

		const landAnnualAvg = (landResult.annual[0] + landResult.annual[1]) / 2
		const oceanAnnualAvg = (oceanResult.annual[0] + oceanResult.annual[1]) / 2
		expect(landAnnualAvg).toBeGreaterThan(oceanAnnualAvg)
	})
})
