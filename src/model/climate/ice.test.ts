import { describe, expect, it } from "vitest"
import type { GenesisClimate, GenesisRainfall, SphereMesh } from ".."
import { TIME } from "../shared/time"
import { computeIceAccumulation } from "./ice"

const DAYS_PER_MONTH = new Float64Array(12)
for (let m = 0; m < 12; m++) DAYS_PER_MONTH[m] = TIME.month.days(m).length

function buildClimate(
	temperatureMonthly: number[],
	numRegions: number,
): GenesisClimate {
	return {
		temperature_avg: new Float32Array(numRegions),
		temperature_min: new Float32Array(numRegions),
		temperature_max: new Float32Array(numRegions),
		temperature_monthly: new Float32Array(temperatureMonthly),
		temperature_monthly_nolapse: new Float32Array(temperatureMonthly.length),
		temperature_monthly_range: new Float32Array(temperatureMonthly.length),
		insolation_monthly: new Float32Array(temperatureMonthly.length),
		pet_monthly: new Float32Array(temperatureMonthly.length),
		daylight_hours_monthly: new Float32Array(temperatureMonthly.length),
		landFraction: [],
	}
}

function buildRainfall(monthly: number[], numRegions: number): GenesisRainfall {
	return {
		monthly: new Float32Array(monthly),
		annual: new Float32Array(numRegions),
		east: new Float32Array(numRegions),
		west: new Float32Array(numRegions),
	}
}

function computeIceAccumulationReference(
	mesh: SphereMesh,
	climate: GenesisClimate,
	rainfall: GenesisRainfall,
	isLand: Uint8Array,
	distCoast: Float32Array,
	cycles = 15,
) {
	const ice = new Float32Array(mesh.numRegions)
	const iceMin = new Float32Array(mesh.numRegions)
	const iceMax = new Float32Array(mesh.numRegions)
	const coastBoost = new Float32Array(mesh.numRegions)

	for (let r = 0; r < mesh.numRegions; r++) {
		if (isLand[r]) continue
		const d = distCoast[r]
		if (d < 8) coastBoost[r] = 1 - d / 8
	}

	for (let cycle = 0; cycle < cycles; cycle++) {
		const isFinalYear = cycle === cycles - 1
		if (isFinalYear) {
			for (let r = 0; r < mesh.numRegions; r++) {
				iceMin[r] = Infinity
				iceMax[r] = 0
			}
		}

		for (let m = 0; m < 12; m++) {
			const mOff = m * mesh.numRegions
			const days = DAYS_PER_MONTH[m]

			for (let r = 0; r < mesh.numRegions; r++) {
				const temp = climate.temperature_monthly[mOff + r]

				if (isLand[r]) {
					if (temp < 0) {
						ice[r] += rainfall.monthly[mOff + r]
					} else if (temp > 0 && ice[r] > 0) {
						const melt = temp * days * 6
						ice[r] = ice[r] > melt ? ice[r] - melt : 0
					}
				} else {
					const cb = coastBoost[r]
					const freezeThresh = -2 + cb * 2
					const accumRate = 10 + cb * 5
					if (temp < freezeThresh) {
						ice[r] += accumRate
					} else if (temp > freezeThresh && ice[r] > 0) {
						const meltRate = 0.5 * (1 - cb * 0.4)
						const melt = (temp - freezeThresh) * days * meltRate
						ice[r] = ice[r] > melt ? ice[r] - melt : 0
					}
				}

				if (isFinalYear) {
					if (ice[r] < iceMin[r]) iceMin[r] = ice[r]
					if (ice[r] > iceMax[r]) iceMax[r] = ice[r]
				}
			}
		}
	}

	for (let r = 0; r < mesh.numRegions; r++) {
		if (iceMin[r] === Infinity) iceMin[r] = 0
	}

	return { iceThickness: ice, iceMinMonthly: iceMin, iceMaxMonthly: iceMax }
}

function expectArraysClose(actual: Float32Array, expected: Float32Array) {
	expect(actual).toHaveLength(expected.length)
	for (let i = 0; i < actual.length; i++) {
		expect(actual[i]).toBeCloseTo(expected[i], 4)
	}
}

describe("computeIceAccumulation", () => {
	it("matches the monthly reference for mixed land and ocean cells", () => {
		// Arrange
		const mesh = { numRegions: 4 } as SphereMesh
		const climate = buildClimate(
			[
				-12, 14, -5, 8, -10, 15, -4, 10, -6, 16, -3, 11, 2, 17, -1, 12, 6, 18,
				1, 14, 9, 20, 3, 16, 8, 19, 2, 15, 4, 18, 0, 13, -2, 17, -1, 11, -7, 16,
				-3, 10, -10, 15, -4, 9, -13, 14, -6, 8,
			],
			4,
		)
		const rainfall = buildRainfall(
			[
				45, 20, 0, 15, 40, 18, 0, 14, 35, 16, 0, 12, 20, 14, 0, 10, 10, 12, 0,
				8, 5, 10, 0, 6, 5, 10, 0, 6, 10, 12, 0, 8, 20, 14, 0, 10, 35, 16, 0, 12,
				40, 18, 0, 14, 45, 20, 0, 15,
			],
			4,
		)
		const isLand = new Uint8Array([1, 1, 0, 0])
		const distCoast = new Float32Array([0, 0, 1, 12])

		// Act
		const actual = computeIceAccumulation(
			mesh,
			climate,
			rainfall,
			isLand,
			distCoast,
			6,
		)
		const expected = computeIceAccumulationReference(
			mesh,
			climate,
			rainfall,
			isLand,
			distCoast,
			6,
		)

		// Assert
		expectArraysClose(actual.iceThickness, expected.iceThickness)
		expectArraysClose(actual.iceMinMonthly, expected.iceMinMonthly)
		expectArraysClose(actual.iceMaxMonthly, expected.iceMaxMonthly)
	})

	it("keeps non-freezing cells ice-free", () => {
		// Arrange
		const mesh = { numRegions: 2 } as SphereMesh
		const climate = buildClimate(
			Array.from({ length: 24 }, (_, index) => (index % 2 === 0 ? 9 : 6)),
			2,
		)
		const rainfall = buildRainfall(new Array(24).fill(25), 2)
		const isLand = new Uint8Array([1, 0])
		const distCoast = new Float32Array([0, 16])

		// Act
		const result = computeIceAccumulation(
			mesh,
			climate,
			rainfall,
			isLand,
			distCoast,
			8,
		)

		// Assert
		expect(Array.from(result.iceThickness)).toEqual([0, 0])
		expect(Array.from(result.iceMinMonthly)).toEqual([0, 0])
		expect(Array.from(result.iceMaxMonthly)).toEqual([0, 0])
	})

	it("returns zeroed arrays when accumulation cycles are disabled", () => {
		const mesh = { numRegions: 2 } as SphereMesh
		const climate = buildClimate(new Array(24).fill(-5), 2)
		const rainfall = buildRainfall(new Array(24).fill(20), 2)

		const result = computeIceAccumulation(
			mesh,
			climate,
			rainfall,
			new Uint8Array([1, 0]),
			new Float32Array([0, 0]),
			0,
		)

		expect(Array.from(result.iceThickness)).toEqual([0, 0])
		expect(Array.from(result.iceMinMonthly)).toEqual([0, 0])
		expect(Array.from(result.iceMaxMonthly)).toEqual([0, 0])
	})

	it("matches the reference for a single active cycle with exact no-op thresholds", () => {
		const mesh = { numRegions: 2 } as SphereMesh
		const climate = buildClimate(
			[
				-4, -3, -2, -1, 0, 0, 3, 1, 0, 0, -1, -2, -3, -4, 0, 0, 2, 1, 0, 0, -2,
				-3, -4, -1,
			],
			2,
		)
		const rainfall = buildRainfall(
			[
				20, 0, 15, 0, 0, 0, 0, 0, 0, 0, 10, 0, 12, 0, 0, 0, 0, 0, 0, 0, 18, 0,
				16, 0,
			],
			2,
		)
		const isLand = new Uint8Array([1, 0])
		const distCoast = new Float32Array([0, 0])

		const actual = computeIceAccumulation(
			mesh,
			climate,
			rainfall,
			isLand,
			distCoast,
			1,
		)
		const expected = computeIceAccumulationReference(
			mesh,
			climate,
			rainfall,
			isLand,
			distCoast,
			1,
		)

		expectArraysClose(actual.iceThickness, expected.iceThickness)
		expectArraysClose(actual.iceMinMonthly, expected.iceMinMonthly)
		expectArraysClose(actual.iceMaxMonthly, expected.iceMaxMonthly)
	})

	it("matches the reference when active cells lose more ice than they gain annually", () => {
		const mesh = { numRegions: 2 } as SphereMesh
		const climate = buildClimate(
			[
				-5, -1, 5, 4, 5, 4, 5, 4, 5, 4, 5, 4, -4, -1, 5, 4, 5, 4, 5, 4, 5, 4, 5,
				4,
			],
			2,
		)
		const rainfall = buildRainfall(
			[
				80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
				0,
			],
			2,
		)
		const isLand = new Uint8Array([1, 0])
		const distCoast = new Float32Array([0, 0])

		const actual = computeIceAccumulation(
			mesh,
			climate,
			rainfall,
			isLand,
			distCoast,
			4,
		)
		const expected = computeIceAccumulationReference(
			mesh,
			climate,
			rainfall,
			isLand,
			distCoast,
			4,
		)

		expectArraysClose(actual.iceThickness, expected.iceThickness)
		expectArraysClose(actual.iceMinMonthly, expected.iceMinMonthly)
		expectArraysClose(actual.iceMaxMonthly, expected.iceMaxMonthly)
	})

	it("matches the reference when land ice both carries over and only partially melts", () => {
		const mesh = { numRegions: 1 } as SphereMesh
		const climate = buildClimate(
			[-8, -8, -8, -8, -8, -8, 1, 1, -8, -8, -8, -8],
			1,
		)
		const rainfall = buildRainfall(
			[40, 40, 40, 40, 40, 40, 0, 0, 40, 40, 40, 40],
			1,
		)
		const isLand = new Uint8Array([1])
		const distCoast = new Float32Array([0])

		const actual = computeIceAccumulation(
			mesh,
			climate,
			rainfall,
			isLand,
			distCoast,
			3,
		)
		const expected = computeIceAccumulationReference(
			mesh,
			climate,
			rainfall,
			isLand,
			distCoast,
			3,
		)

		expectArraysClose(actual.iceThickness, expected.iceThickness)
		expectArraysClose(actual.iceMinMonthly, expected.iceMinMonthly)
		expectArraysClose(actual.iceMaxMonthly, expected.iceMaxMonthly)
	})
})
