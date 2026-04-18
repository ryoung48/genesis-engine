import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"
import { computeWind } from "./wind"

describe("computeWind", () => {
	it("producesWindEastMonthlyArrayOfTwelveTimesN", () => {
		const world = getCachedWorld()
		const N = world.mesh.numRegions
		const result = computeWind(world.mesh, world.climate, world.params)
		expect(result.wind_east_monthly.length).toBe(12 * N)
	})

	it("producesWindNorthMonthlyArrayOfTwelveTimesN", () => {
		const world = getCachedWorld()
		const N = world.mesh.numRegions
		const result = computeWind(world.mesh, world.climate, world.params)
		expect(result.wind_north_monthly.length).toBe(12 * N)
	})

	it("producesWindSpeedMonthlyArrayOfTwelveTimesN", () => {
		const world = getCachedWorld()
		const N = world.mesh.numRegions
		const result = computeWind(world.mesh, world.climate, world.params)
		expect(result.wind_speed_monthly.length).toBe(12 * N)
	})

	it("producesNonNegativeWindSpeed", () => {
		const world = getCachedWorld()
		const result = computeWind(world.mesh, world.climate, world.params)
		const { wind_speed_monthly } = result
		for (let i = 0; i < wind_speed_monthly.length; i++) {
			expect(wind_speed_monthly[i]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesFiniteWindComponents", () => {
		const world = getCachedWorld()
		const result = computeWind(world.mesh, world.climate, world.params)
		const { wind_east_monthly, wind_north_monthly } = result
		for (let i = 0; i < wind_east_monthly.length; i++) {
			expect(Number.isFinite(wind_east_monthly[i])).toBe(true)
			expect(Number.isFinite(wind_north_monthly[i])).toBe(true)
		}
	})

	it("producesWindSpeedEqualToAbsoluteEastComponent", () => {
		// From implementation: wind_speed_monthly[i] = Math.abs(zonalWind)
		// and wind_east_monthly[i] = zonalWind (purely zonal model)
		const world = getCachedWorld()
		const result = computeWind(world.mesh, world.climate, world.params)
		const { wind_east_monthly, wind_speed_monthly } = result
		for (let i = 0; i < wind_speed_monthly.length; i++) {
			expect(wind_speed_monthly[i]).toBeCloseTo(
				Math.abs(wind_east_monthly[i]),
				5,
			)
		}
	})
})
