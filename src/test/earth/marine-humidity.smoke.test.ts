import { describe, expect, it } from "vitest"
import { HUMIDITY } from "@/model/climate/precipitation/humidity"
import { HUMIDITY_MARINE } from "@/model/climate/precipitation/humidity/marine"
import type { MarineHumidityWorld } from "@/model/climate/precipitation/humidity/marine/types"

function fixture(): MarineHumidityWorld {
	const N = 4
	const monthly = (value: number) => new Float32Array(12 * N).fill(value)
	const chord = (km: number) => 2 * Math.sin(km / 2000)
	return {
		mesh: {
			numRegions: N,
			adjOffset: new Int32Array([0, 1, 3, 5, 6]),
			adjList: new Int32Array([1, 0, 2, 1, 3, 2]),
			neighborDist: new Float32Array([
				chord(50),
				chord(50),
				chord(100),
				chord(100),
				chord(300),
				chord(300),
			]),
		},
		params: { planetRadiusKm: 1000 },
		isLand: new Uint8Array([1, 0, 0, 0]),
		climate: {
			temperature_avg: new Float32Array(N).fill(20),
			temperature_monthly: monthly(20),
			pet_monthly: monthly(100),
		},
		rainfall: { annual: new Float32Array(N).fill(1000) },
		hydrology: { aet_monthly: monthly(50) },
		oceanDist: new Float32Array(N),
		dtr_annual: new Float32Array([12, 1, 1, 1]),
		dtr_monthly: Float32Array.from({ length: 12 * N }, (_, i) =>
			i % N === 0 ? 12 : 1,
		),
	} as unknown as MarineHumidityWorld
}

describe("marine humidity display fields", () => {
	it("keeps land humidity and smoothly blends toward 80 percent offshore", () => {
		const world = fixture()
		const fields = HUMIDITY_MARINE.fields(world)
		const land = HUMIDITY.relativeHumidityFromTempRange({
			meanTempC: 20,
			dtrC: 12,
			annualAridity: 0.5,
			annualRainfallMm: 1000,
			distFromOceanKm: 0,
		})
		expect(fields.annual[0]).toBeCloseTo(land, 5)
		expect(fields.annual[1]).toBeCloseTo(
			80 + (1 - (1 / 6) ** 2 * (3 - 2 / 6)) * (land - 80),
			4,
		)
		expect(fields.annual[2]).toBeCloseTo((land + 80) / 2, 4)
		expect(fields.annual[3]).toBe(80)
	})

	it("preserves existing values below 80 percent in annual and monthly fields", () => {
		const world = fixture()
		world.dtr_annual[2] = 25
		world.dtr_monthly![2] = 25
		const fields = HUMIDITY_MARINE.fields(world)
		const dry = HUMIDITY.relativeHumidityFromTempRange({
			meanTempC: 20,
			dtrC: 25,
			annualRainfallMm: 1000,
			distFromOceanKm: 0,
		})
		expect(dry).toBeLessThan(80)
		expect(fields.annual[2]).toBeCloseTo(dry, 5)
		expect(fields.monthly[2]).toBeCloseTo(dry, 5)
		expect(fields.monthly[6]).toBeGreaterThan(dry)
	})

	it("uses the nearest land and allows a humid coastal transition above 80", () => {
		const world = fixture()
		world.isLand[3] = 1
		world.dtr_annual[3] = 2
		world.mesh.neighborDist[4] = 2 * Math.sin(50 / 2000)
		world.mesh.neighborDist[5] = world.mesh.neighborDist[4]
		const fields = HUMIDITY_MARINE.fields(world)
		expect(fields.annual[1]).toBeLessThan(80)
		expect(fields.annual[2]).toBeGreaterThan(80)
		expect(fields.annual[2]).toBeLessThan(fields.annual[3])
	})

	it("uses the selected month's land humidity and invalidates changed climate inputs", () => {
		const world = fixture()
		world.dtr_monthly![0] = 2
		const first = HUMIDITY_MARINE.fields(world)
		expect(first.monthly[1]).toBeGreaterThan(first.annual[1])
		expect(HUMIDITY_MARINE.fields(world)).toBe(first)
		world.dtr_annual = new Float32Array([2, 1, 1, 1])
		const second = HUMIDITY_MARINE.fields(world)
		expect(second).not.toBe(first)
		expect(second.annual[1]).toBeGreaterThan(first.annual[1])
	})

	it("handles worlds without land", () => {
		const world = fixture()
		world.isLand.fill(0)
		world.dtr_annual.fill(1)
		world.dtr_monthly!.fill(1)
		const fields = HUMIDITY_MARINE.fields(world)
		expect(Array.from(fields.annual)).toEqual([80, 80, 80, 80])
		expect(fields.monthly.every((value) => value === 80)).toBe(true)
	})
})
