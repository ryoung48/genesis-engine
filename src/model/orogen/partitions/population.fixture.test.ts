import { describe, expect, it } from "vitest"
import { getCachedWorld } from "../__fixtures__/world"

describe("pipeline population output", () => {
	it("producesHabitabilityArrayLengthMatchingProvinceCount", () => {
		const world = getCachedWorld()
		expect(world.population?.habitability.length).toBe(world.provinces!.count)
	})

	it("producesPopulationArrayLengthMatchingProvinceCount", () => {
		const world = getCachedWorld()
		expect(world.population?.population.length).toBe(world.provinces!.count)
	})

	it("producesNonNegativeHabitabilityForEveryProvince", () => {
		const world = getCachedWorld()
		const { habitability } = world.population!
		for (let p = 0; p < habitability.length; p++) {
			expect(habitability[p]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesNonNegativePopulationForEveryProvince", () => {
		const world = getCachedWorld()
		const { population } = world.population!
		for (let p = 0; p < population.length; p++) {
			expect(population[p]).toBeGreaterThanOrEqual(0)
		}
	})

	it("producesZeroHabitabilityForDesolateProvinces", () => {
		const world = getCachedWorld()
		const { habitability } = world.population!
		const { desolate, count } = world.provinces!
		for (let p = 0; p < count; p++) {
			if (desolate[p]) expect(habitability[p]).toBe(0)
		}
	})

	it("producesTotalPopulationCloseToSumOfProvincePopulations", () => {
		const world = getCachedWorld()
		const { population, totalPopulation } = world.population!
		let sum = 0
		for (let p = 0; p < population.length; p++) sum += population[p]
		const relError = Math.abs(totalPopulation - sum) / Math.max(1, sum)
		expect(relError).toBeLessThan(1e-5)
	})

	it("producesPositiveTotalPopulationForHabitableWorld", () => {
		const world = getCachedWorld()
		expect(world.population?.totalPopulation).toBeGreaterThan(0)
	})
})
