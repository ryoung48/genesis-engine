import { describe, expect, it } from "vitest"
import { HABITABILITY } from "@/model/climate/habitability"
import { HUMIDITY } from "@/model/climate/precipitation/humidity"

interface Cell {
	temperatureC: number[]
	dtrC: number
	rainMm: number
	petMm: number
	pressureBar?: number
}

function classify({
	temperatureC,
	dtrC,
	rainMm,
	petMm,
	pressureBar = 1,
}: Cell) {
	return HABITABILITY.classify({
		climate: {
			temperature_monthly: Float32Array.from(temperatureC),
			pet_monthly: new Float32Array(12).fill(petMm / 12),
		},
		rainfall: { annual: Float32Array.of(rainMm) },
		dtrMonthly: new Float32Array(12).fill(dtrC),
		oceanDist: Float32Array.of(0),
		isLand: Uint8Array.of(1),
		pressureBar,
		numRegions: 1,
	})
}

const flat = (c: number) => new Array<number>(12).fill(c)

describe("habitability gates", () => {
	it("solves the wet bulb of saturated and half-saturated air", () => {
		const saturated = HABITABILITY.wetBulbC({
			tempC: 40,
			vaporPressureKpa: HUMIDITY.saturationVaporPressureKpa(40),
			pressureKpa: 101.325,
		})
		const half = HABITABILITY.wetBulbC({
			tempC: 30,
			vaporPressureKpa: HUMIDITY.saturationVaporPressureKpa(30) / 2,
			pressureKpa: 101.325,
		})
		expect(saturated).toBeCloseTo(40, 2)
		expect(half).toBeGreaterThan(21)
		expect(half).toBeLessThan(23)
	})

	it("places the boiling point by pressure", () => {
		expect(HABITABILITY.boilingPointC({ pressureBar: 1.01325 })).toBeCloseTo(
			100,
			-0.3,
		)
		expect(HABITABILITY.boilingPointC({ pressureBar: 0.1 })).toBeGreaterThan(44)
		expect(HABITABILITY.boilingPointC({ pressureBar: 0.1 })).toBeLessThan(47)
		expect(HABITABILITY.boilingPointC({ pressureBar: 10 })).toBeGreaterThan(170)
	})

	it("marks land whose every monthly mean is below freezing however large the day range, and passes one thawing month", () => {
		const frozen = classify({
			temperatureC: flat(-5),
			dtrC: 4,
			rainMm: 400,
			petMm: 300,
		})
		const thaw = flat(-5)
		thaw[6] = 1
		const thawing = classify({
			temperatureC: thaw,
			dtrC: 4,
			rainMm: 400,
			petMm: 300,
		})
		expect(frozen.uninhabitable[0]).toBe(1)
		expect(thawing.uninhabitable[0]).toBe(0)
		const swinging = classify({
			temperatureC: flat(-4),
			dtrC: 12,
			rainMm: 400,
			petMm: 300,
		})
		expect(swinging.uninhabitable[0]).toBe(1)
	})

	it("marks land above the boiling point of thin air", () => {
		const thin = { dtrC: 10, rainMm: 100, petMm: 800, pressureBar: 0.1 }
		expect(classify({ ...thin, temperatureC: flat(40) }).uninhabitable[0]).toBe(
			0,
		)
		expect(classify({ ...thin, temperatureC: flat(60) }).uninhabitable[0]).toBe(
			1,
		)
	})

	it("marks humid heat past the wet-bulb limit but not dry heat", () => {
		const humid = classify({
			temperatureC: flat(35),
			dtrC: 6,
			rainMm: 2000,
			petMm: 1500,
		})
		const dry = classify({
			temperatureC: flat(35),
			dtrC: 14,
			rainMm: 150,
			petMm: 1500,
		})
		expect(humid.uninhabitable[0]).toBe(1)
		expect(dry.uninhabitable[0]).toBe(0)
	})

	it("flags hyper-arid water balance by the P/PET index", () => {
		const base = { temperatureC: flat(20), dtrC: 10, petMm: 2000 }
		expect(classify({ ...base, rainMm: 80 }).hyperArid[0]).toBe(1)
		expect(classify({ ...base, rainMm: 120 }).hyperArid[0]).toBe(0)
	})
})
