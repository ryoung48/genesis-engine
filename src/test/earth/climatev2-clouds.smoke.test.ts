import { describe, expect, it } from "vitest"
import { CLIMATEV2_CLOUDS } from "@/model/climatev2/clouds"
import { CLIMATEV2_CLOUD_RADIATION } from "@/model/climatev2/clouds/radiation"
import type { CloudRadiationParams } from "@/model/climatev2/clouds/radiation/types"
import type { CloudEstimateParams } from "@/model/climatev2/clouds/types"
import { LatLonGrid } from "@/model/climatev2/vendor/grid.js"

function inputs(): CloudEstimateParams {
	const grid = new LatLonGrid(90)
	const monthly = () => new Float32Array(12 * grid.size)
	return {
		ctx: {
			grid,
			anchorMonths: [0, 6],
			options: {},
			surface: {
				landFrac: new Float32Array(grid.size),
				meanKm: new Float32Array(grid.size),
				meanLandKm: new Float32Array(grid.size),
			},
		},
		winds: {
			u: monthly(),
			v: monthly(),
			slp: monthly(),
			conv: monthly(),
			itczLat: new Float32Array(12 * grid.w),
			belts: [],
		},
		rainfall: monthly(),
		temperatureMonthly: monthly().fill(15),
		yearScale: 1,
		humidity: new Float32Array(2 * grid.size),
		stability: new Float32Array(2 * grid.size),
	}
}

function radiationInputs(): CloudRadiationParams {
	const input = inputs()
	input.humidity.fill(0.8)
	input.stability.fill(5)
	input.rainfall.fill(100)
	return {
		core: input.ctx.grid,
		grid: input.ctx.grid,
		ratio: 1,
		clouds: CLIMATEV2_CLOUDS.estimate(input),
		landFrac: new Float64Array(input.ctx.grid.size).fill(0.5),
		winds: input.winds,
		albedo: 0.262,
		longwaveCancellation: 0.8,
		lowAlbedo: 0.04,
		longwaveWindow: 0.5,
	}
}

describe("v2 diagnostic clouds", () => {
	it("allows stable moist air to form low cloud without rain", () => {
		const input = inputs()
		input.humidity.fill(0.8)
		const mixed = CLIMATEV2_CLOUDS.estimate(input)
		input.stability.fill(5)
		const stable = CLIMATEV2_CLOUDS.estimate(input)
		expect(stable.low[0]).toBeGreaterThan(mixed.low[0])
		expect(stable.cover[0]).toBeCloseTo(0.9)
		expect(stable.high[0]).toBe(0)
	})

	it("bounds cover and combines layers by random overlap", () => {
		const input = inputs()
		input.humidity.fill(1.5)
		input.stability.fill(50)
		input.rainfall.fill(100)
		input.winds.conv.fill(1)
		const clouds = CLIMATEV2_CLOUDS.estimate(input)
		expect(clouds.high[0]).toBeCloseTo(1 - Math.exp(-1))
		expect(clouds.cover[0]).toBeCloseTo(
			1 - (1 - clouds.low[0]) * (1 - clouds.high[0]),
		)
		expect(Math.max(...clouds.cover)).toBeLessThanOrEqual(1)
		expect(Math.min(...clouds.cover)).toBeGreaterThanOrEqual(0)
	})

	it("interpolates humidity cyclically and normalizes rain by year length", () => {
		const input = inputs()
		const G = input.ctx.grid.size
		input.humidity.fill(0.8, G)
		input.stability.fill(5)
		input.rainfall.fill(100)
		const earth = CLIMATEV2_CLOUDS.estimate(input)
		expect(earth.low[0]).toBe(0)
		expect(earth.low[3 * G]).toBeCloseTo(earth.low[9 * G])
		input.rainfall.fill(200)
		input.yearScale = 2
		const longer = CLIMATEV2_CLOUDS.estimate(input)
		expect(longer.high).toEqual(earth.high)
	})

	it("preserves the background radiation for uniform cloud fields", () => {
		const result = CLIMATEV2_CLOUD_RADIATION.compute(radiationInputs())
		expect(Math.max(...result.land.map(Math.abs))).toBeLessThan(1e-12)
		expect(Math.max(...result.sea.map(Math.abs))).toBeLessThan(1e-12)
		expect(Math.max(...result.landLongwave.map(Math.abs))).toBeLessThan(1e-12)
		expect(Math.max(...result.seaLongwave.map(Math.abs))).toBeLessThan(1e-12)
	})

	it("treats infrared trapping separately from sunlight reflection", () => {
		const input = radiationInputs()
		input.winds.belts = Array.from({ length: 12 }, () => ({
			itcz: 45,
			hiN: 80,
			hiS: -30,
			loN: 85,
			loS: -60,
			midN: 60,
			midS: -45,
		}))
		input.clouds.low.fill(0)
		input.clouds.high.fill(0)
		for (let m = 0; m < 12; m++) input.clouds.high[m * input.grid.size] = 1
		const active = CLIMATEV2_CLOUD_RADIATION.compute(input)
		input.longwaveWindow = 0
		const noTrapping = CLIMATEV2_CLOUD_RADIATION.compute(input)
		expect(active.land).toEqual(noTrapping.land)
		expect(active.landLongwave[0]).toBeGreaterThan(0)
		expect(noTrapping.landLongwave[0]).toBe(0)
	})

	it("gives higher colder clouds a larger thermal contrast", () => {
		const input = inputs()
		input.temperatureMonthly.fill(25)
		const clouds = CLIMATEV2_CLOUDS.estimate(input)
		expect(clouds.highThermalContrast[0]).toBeGreaterThan(
			clouds.lowThermalContrast[0],
		)
		expect(clouds.lowThermalContrast[0]).toBeGreaterThan(0)
		input.temperatureMonthly.fill(-100)
		const cold = CLIMATEV2_CLOUDS.estimate(input)
		expect(Math.min(...cold.highThermalContrast)).toBeGreaterThanOrEqual(0)
	})

	it("shades cloudier regions while keeping the ocean row mean unchanged", () => {
		const input = radiationInputs()
		const G = input.grid.size
		input.clouds.high.fill(0)
		input.clouds.low.fill(0)
		for (let m = 0; m < 12; m++) input.clouds.low[m * G] = 1
		const result = CLIMATEV2_CLOUD_RADIATION.compute(input)
		expect(result.land[0]).toBeGreaterThan(0)
		expect(result.sea[0]).toBeGreaterThan(0)
		expect(result.sea[1]).toBeLessThan(0)
		expect(
			result.sea.subarray(0, input.grid.w).reduce((sum, v) => sum + v, 0),
		).toBeCloseTo(0, 12)
	})
})
