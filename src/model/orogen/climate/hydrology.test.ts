import { describe, expect, it } from "vitest"
import { fillPetMonthlyHargreaves, petMonthHargreaves } from "./hydrology"

describe("petMonthHargreaves", () => {
	it("returnsPositivePetForTypicalInputs", () => {
		// tas=20°C, td=10°C DTR, raWm2=400 W/m², dpm=30 days
		const pet = petMonthHargreaves(20, 10, 400, 30)
		expect(pet).toBeGreaterThan(0)
	})

	it("returnsZeroPetWhenInsolationIsZero", () => {
		const pet = petMonthHargreaves(20, 10, 0, 30)
		expect(pet).toBe(0)
	})

	it("returnsZeroPetWhenTemperatureIsBelowFreezingAndCold", () => {
		// tas=-50°C → formula result is negative → clamped to 0
		const pet = petMonthHargreaves(-50, 10, 400, 30)
		expect(pet).toBe(0)
	})

	it("producesHigherPetWithHigherTemperature", () => {
		const petCold = petMonthHargreaves(5, 10, 300, 30)
		const petWarm = petMonthHargreaves(25, 10, 300, 30)
		expect(petWarm).toBeGreaterThan(petCold)
	})

	it("producesHigherPetWithMoreInsolation", () => {
		const petLow = petMonthHargreaves(20, 10, 200, 30)
		const petHigh = petMonthHargreaves(20, 10, 500, 30)
		expect(petHigh).toBeGreaterThan(petLow)
	})

	it("scalesPetWithDaysPerMonth", () => {
		const pet28 = petMonthHargreaves(20, 10, 300, 28)
		const pet31 = petMonthHargreaves(20, 10, 300, 31)
		expect(pet31).toBeGreaterThan(pet28)
		expect(pet31 / pet28).toBeCloseTo(31 / 28, 3)
	})

	it("usesAtLeastDtrOfTwoToPreventZeroOutput", () => {
		// td=0 → sqrt(max(2, td)) = sqrt(2), not 0
		const petZeroDtr = petMonthHargreaves(20, 0, 300, 30)
		const petTwoDtr = petMonthHargreaves(20, 2, 300, 30)
		expect(petZeroDtr).toBe(petTwoDtr)
	})
})

describe("fillPetMonthlyHargreaves", () => {
	it("fillsOutputArrayWithCorrectPetValues", () => {
		const N = 3
		const dpm = 30
		const temperature = new Float32Array([20, 25, 10])
		const range = new Float32Array([10, 8, 12])
		const insolation = new Float32Array([400, 350, 200])
		const output = new Float32Array(N)

		fillPetMonthlyHargreaves(temperature, range, insolation, output, dpm)

		for (let i = 0; i < N; i++) {
			expect(output[i]).toBeCloseTo(
				petMonthHargreaves(temperature[i], range[i], insolation[i], dpm),
				5,
			)
		}
	})

	it("producesNonNegativeOutputForAllCells", () => {
		const N = 4
		const temperature = new Float32Array([-30, 0, 15, 30])
		const range = new Float32Array([5, 10, 8, 12])
		const insolation = new Float32Array([100, 200, 350, 400])
		const output = new Float32Array(N)

		fillPetMonthlyHargreaves(temperature, range, insolation, output, 30)

		for (let i = 0; i < N; i++) {
			expect(output[i]).toBeGreaterThanOrEqual(0)
		}
	})
})
