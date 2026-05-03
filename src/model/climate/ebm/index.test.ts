import { describe, expect, it } from "vitest"
import { EMB_CONSTANTS } from "./constants"
import { EnergyBalanceModel } from "./index"

function meanOf(values: readonly number[]): number {
	let sum = 0
	for (const value of values) sum += value
	return sum / Math.max(1, values.length)
}

describe("EnergyBalanceModel", () => {
	it("falls back to generated land fractions and zeroes diffusion where dx is zero", () => {
		const model = new EnergyBalanceModel({
			orbital: EMB_CONSTANTS.orbital,
		})

		model.initModel()
		model.dx[0] = 0

		expect(model.land_fraction).toHaveLength(EMB_CONSTANTS.grid.NUM_LAT)
		expect(model.heatDiffusion(0)[0]).toBe(0)
	})

	it("produces non-zero finite insolation for Earth-like orbital inputs", () => {
		const model = new EnergyBalanceModel({
			orbital: {
				...EMB_CONSTANTS.orbital,
				OBLIQUITY: 23.5,
				ECCENTRICITY: 0.017,
				PERIHELION: 102,
			},
			stellar: EMB_CONSTANTS.stellar,
			time: {
				HOURS_PER_DAY: 24,
				YEAR_LENGTH_DAYS: 365,
			},
			landFraction: new Array(EMB_CONSTANTS.grid.NUM_LAT).fill(0.3),
			radius: 6_400_000,
			pressure: 1,
		})

		model.initModel()

		let minInsolation = Infinity
		let maxInsolation = -Infinity
		let totalInsolation = 0
		let count = 0
		for (const row of model.insolation) {
			for (const value of row) {
				expect(Number.isFinite(value)).toBe(true)
				minInsolation = Math.min(minInsolation, value)
				maxInsolation = Math.max(maxInsolation, value)
				totalInsolation += value
				count++
			}
		}

		expect(minInsolation).toBeGreaterThanOrEqual(0)
		expect(maxInsolation).toBeGreaterThan(500)
		expect(totalInsolation / count).toBeGreaterThan(150)
	})

	it("keeps the first orbital step finite", () => {
		const model = new EnergyBalanceModel({
			orbital: {
				...EMB_CONSTANTS.orbital,
				OBLIQUITY: 23.5,
				ECCENTRICITY: 0.017,
				PERIHELION: 102,
			},
			stellar: EMB_CONSTANTS.stellar,
			time: {
				HOURS_PER_DAY: 24,
				YEAR_LENGTH_DAYS: 365,
			},
			landFraction: new Array(EMB_CONSTANTS.grid.NUM_LAT).fill(0.3),
			radius: 6_400_000,
			pressure: 1,
		})

		model.initModel()
		model.stepTemperature(0, 24 * 3600 * 0.5)

		for (const row of model.temperature) {
			for (const value of row) {
				expect(Number.isFinite(value)).toBe(true)
			}
		}
	})

	it("keeps Earth-like orbital temperatures finite and temperate", () => {
		const model = new EnergyBalanceModel({
			orbital: {
				...EMB_CONSTANTS.orbital,
				OBLIQUITY: 23.5,
				ECCENTRICITY: 0.017,
				PERIHELION: 102,
			},
			stellar: EMB_CONSTANTS.stellar,
			time: {
				HOURS_PER_DAY: 24,
				YEAR_LENGTH_DAYS: 365,
			},
			landFraction: new Array(EMB_CONSTANTS.grid.NUM_LAT).fill(0.3),
			radius: 6_400_000,
			pressure: 1,
		})

		model.runModel(30, 0.5)

		for (const value of model.temperature_avg) {
			expect(Number.isFinite(value)).toBe(true)
			expect(value).toBeGreaterThan(-100)
		}
		expect(meanOf(model.temperature_avg)).toBeGreaterThan(-20)
	})

	it("breaks out early once temperatures stop changing", () => {
		const model = new EnergyBalanceModel({
			orbital: EMB_CONSTANTS.orbital,
		})
		let calls = 0
		model.stepTemperature = () => {
			calls++
		}

		model.runModel(1, 0.5)

		expect(calls).toBeLessThan(EMB_CONSTANTS.time.DAYS_PER_YEAR * 2)
		expect(model.temperature_avg.every(Number.isFinite)).toBe(true)
	})

	it("converts NaN temperatures to finite Celsius output", () => {
		const model = new EnergyBalanceModel({
			orbital: EMB_CONSTANTS.orbital,
			pressure: 0.5,
			time: {
				HOURS_PER_DAY: 48,
				YEAR_LENGTH_DAYS: 180,
			},
		})
		model.stepTemperature = (tIdx) => {
			const nextIdx = (tIdx + 1) % EMB_CONSTANTS.time.DAYS_PER_YEAR
			model.temperature[0][nextIdx] = Number.NaN
		}

		model.runModel(1, 1)

		expect(model.temperature[0]).toContain(-273.15)
		expect(model.temperature_avg.every(Number.isFinite)).toBe(true)
	})
})
