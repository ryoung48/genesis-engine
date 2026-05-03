import { describe, expect, it } from "vitest"
import {
	computeHydrologyFields,
	fillPetMonthlyHargreaves,
	petMonthHargreaves,
	refreshClimatePetMonthly,
} from "./hydrology"

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

describe("refreshClimatePetMonthly", () => {
	it("uses the provided year length when refreshing monthly PET", () => {
		const climate = {
			temperature_monthly: new Float32Array([20]),
			temperature_monthly_range: new Float32Array([10]),
			insolation_monthly: new Float32Array([400]),
			pet_monthly: new Float32Array(1),
		}

		refreshClimatePetMonthly(climate, { daysPerYear: 480 })

		expect(climate.pet_monthly[0]).toBeCloseTo(
			petMonthHargreaves(20, 10, 400, 480),
			3,
		)
	})

	it("falls back to an average Gregorian month when year length is omitted", () => {
		const climate = {
			temperature_monthly: new Float32Array([20]),
			temperature_monthly_range: new Float32Array([10]),
			insolation_monthly: new Float32Array([400]),
			pet_monthly: new Float32Array(1),
		}

		refreshClimatePetMonthly(climate)

		expect(climate.pet_monthly[0]).toBeCloseTo(
			petMonthHargreaves(20, 10, 400, 365 / 12),
			3,
		)
	})
})

describe("computeHydrologyFields", () => {
	it("keeps ocean cells zeroed while saturating wet land cells at PET", () => {
		const N = 2
		const hydrology = computeHydrologyFields(
			{
				pet_monthly: new Float32Array(
					Array.from({ length: 12 * N }, (_, index) =>
						index % N === 0 ? 10 : 5,
					),
				),
			},
			{
				monthly: new Float32Array(
					Array.from({ length: 12 * N }, (_, index) =>
						index % N === 0 ? 20 : 0,
					),
				),
			},
			new Uint8Array([1, 0]),
		)

		for (let month = 0; month < 12; month++) {
			expect(hydrology.aet_monthly[month * N]).toBeCloseTo(10, 5)
			expect(hydrology.aridity_monthly[month * N]).toBeCloseTo(1, 5)
			expect(hydrology.baseflow_monthly[month * N]).toBeGreaterThan(0)

			expect(hydrology.aet_monthly[month * N + 1]).toBe(0)
			expect(hydrology.aridity_monthly[month * N + 1]).toBe(0)
			expect(hydrology.baseflow_monthly[month * N + 1]).toBe(0)
		}
	})

	it("produces sub-PET aridity in persistently dry land cells", () => {
		const hydrology = computeHydrologyFields(
			{
				pet_monthly: new Float32Array(12).fill(12),
			},
			{
				monthly: new Float32Array(12).fill(3),
			},
			new Uint8Array([1]),
		)

		expect(Array.from(hydrology.aet_monthly).every((value) => value < 12)).toBe(
			true,
		)
		expect(
			Array.from(hydrology.aridity_monthly).every(
				(value) => value > 0 && value < 1,
			),
		).toBe(true)
	})

	it("treats zero-PET cells as fully humid without generating groundwater flow", () => {
		const hydrology = computeHydrologyFields(
			{
				pet_monthly: new Float32Array(12),
			},
			{
				monthly: new Float32Array(12),
			},
			new Uint8Array([1]),
		)

		expect(Array.from(hydrology.aet_monthly)).toEqual(new Array(12).fill(0))
		expect(Array.from(hydrology.aridity_monthly)).toEqual(new Array(12).fill(1))
		expect(Array.from(hydrology.baseflow_monthly)).toEqual(
			new Array(12).fill(0),
		)
	})

	it("carries stored soil moisture and groundwater through later dry months", () => {
		const rainfall = new Float32Array([
			80, 80, 80, 80, 80, 80, 0, 0, 0, 0, 0, 0,
		])
		const hydrology = computeHydrologyFields(
			{
				pet_monthly: new Float32Array(12).fill(20),
			},
			{
				monthly: rainfall,
			},
			new Uint8Array([1]),
		)

		expect(hydrology.aet_monthly[6]).toBeGreaterThan(0)
		expect(hydrology.aet_monthly[6]).toBeLessThanOrEqual(20)
		expect(hydrology.baseflow_monthly[6]).toBeGreaterThan(0)
		expect(hydrology.baseflow_monthly[11]).toBeGreaterThan(0)
	})
})
