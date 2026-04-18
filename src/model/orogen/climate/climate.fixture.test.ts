import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline climate output", () => {
	it("producesTwelveMonthsOfTemperaturePerRegion", () => {
		const world = getCachedWorld()
		const N = world.mesh.numRegions
		expect(world.climate?.temperature_monthly.length).toBe(12 * N)
	})

	it("producesAnnualAverageForEveryRegion", () => {
		const world = getCachedWorld()
		expect(world.climate?.temperature_avg.length).toBe(world.mesh.numRegions)
	})

	it("producesFiniteTemperatureForEveryRegion", () => {
		const world = getCachedWorld()
		const temps = world.climate!.temperature_avg
		for (let r = 0; r < temps.length; r++) {
			expect(Number.isFinite(temps[r])).toBe(true)
		}
	})

	it("producesColderPolesThanTropicsOnAverage", () => {
		const world = getCachedWorld()
		const { r_xyz } = world.mesh
		const temps = world.climate!.temperature_avg
		let polarSum = 0
		let polarCount = 0
		let tropicalSum = 0
		let tropicalCount = 0
		for (let r = 0; r < temps.length; r++) {
			const z = r_xyz[3 * r + 2]
			const latDeg = (Math.asin(z) * 180) / Math.PI
			if (Math.abs(latDeg) > 70) {
				polarSum += temps[r]
				polarCount++
			} else if (Math.abs(latDeg) < 15) {
				tropicalSum += temps[r]
				tropicalCount++
			}
		}
		const polarMean = polarSum / polarCount
		const tropicalMean = tropicalSum / tropicalCount
		expect(tropicalMean).toBeGreaterThan(polarMean)
	})

	it("producesNonNegativeInsolation", () => {
		const world = getCachedWorld()
		const insolation = world.climate!.insolation_monthly
		for (let i = 0; i < insolation.length; i++) {
			expect(insolation[i]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesDaylightHoursBetweenZeroAndTwentyFour", () => {
		const world = getCachedWorld()
		const daylight = world.climate!.daylight_hours_monthly
		for (let i = 0; i < daylight.length; i++) {
			expect(daylight[i]).toBeGreaterThanOrEqual(0)
			expect(daylight[i]).toBeLessThanOrEqual(24)
		}
	})
})
