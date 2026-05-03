import { describe, expect, it } from "vitest"

import { createRng } from "../shared/rng"
import type { OrogenLandmarks } from "../terrain/landmarks"
import type { OrogenProvinces } from "../types/society"
import { computePopulation } from "./population"

const HAB_CLIMATE = new Float32Array([
	0, 0.01, 0.1, 0.6, 1.25, 1.0, 0.8, 0.01, 0.01,
])
const HAB_VEGETATION = new Float32Array([0, 0.1, 0.3, 0.8, 1.0, 0.8, 0.6])
const HAB_TOPOGRAPHY = new Float32Array([1.0, 0.6, 0.8, 0.2, 0.6, 0, 0])
const HAB_COASTAL = 1.25
const HAB_LANDMARK = new Float32Array([1.0, 0.8, 0.5, 0, 0, 0])

describe("computePopulation", () => {
	it("sums per-region habitability into each province and applies world scoring once", () => {
		const provinces = {
			regionProvince: new Int32Array([0, 0, 1]),
			seeds: new Int32Array([0, 2]),
			count: 2,
			desolate: new Uint8Array([0, 0]),
			landmassId: new Int32Array([0, 0]),
			adjOffset: new Int32Array([0, 0, 0]),
			adjList: new Int32Array(),
			size: new Int32Array([2, 1]),
			colors: new Float32Array(6),
		} satisfies OrogenProvinces
		const landmarks = {
			regionLandmark: new Int32Array([0, 0, 0]),
			type: new Uint8Array([0]),
			size: new Int32Array([3]),
			count: 1,
		} satisfies OrogenLandmarks
		const climateZones = new Uint8Array([4, 1, 4])
		const vegetation = new Uint8Array([4, 4, 4])
		const topography = new Uint8Array([0, 0, 0])
		const coastal = new Uint8Array([0, 0, 0])
		const riverVisible = new Uint8Array([0, 0, 0])
		const seed = 123

		const result = computePopulation(
			provinces,
			landmarks,
			climateZones,
			vegetation,
			topography,
			coastal,
			riverVisible,
			seed,
			1,
			3,
		)

		const rng = createRng(seed + 77777)
		const regionScores = Array.from(climateZones, (climateZone, region) => {
			const randomFactor = 0.8 + rng.random() * 0.4
			return (
				HAB_CLIMATE[climateZone] *
				HAB_VEGETATION[vegetation[region]] *
				HAB_TOPOGRAPHY[topography[region]] *
				HAB_LANDMARK[landmarks.type[landmarks.regionLandmark[region]]] *
				randomFactor
			)
		})
		const expectedProvince0 = regionScores[0] + regionScores[1]
		const expectedProvince1 = regionScores[2]
		const cellAreaKm2 = (4 * Math.PI) / 3
		const expectedHabitabilityScore =
			((expectedProvince0 + expectedProvince1) * cellAreaKm2) / 83302728.146

		expect(result.habitability[0]).toBeCloseTo(expectedProvince0, 5)
		expect(result.habitability[1]).toBeCloseTo(expectedProvince1, 5)
		expect(result.habitabilityScore).toBeCloseTo(expectedHabitabilityScore, 12)
		expect(result.totalPopulation).toBeCloseTo(
			215e6 * expectedHabitabilityScore,
			5,
		)
	})

	it("applies province-wide water access to every region while skipping unassigned and desolate regions", () => {
		const provinces = {
			regionProvince: new Int32Array([-1, 0, 0, 1, 2]),
			seeds: new Int32Array([1, 3, 4]),
			count: 3,
			desolate: new Uint8Array([0, 0, 1]),
			landmassId: new Int32Array([0, 0, 0]),
			adjOffset: new Int32Array([0, 0, 0, 0]),
			adjList: new Int32Array(),
			size: new Int32Array([2, 1, 1]),
			colors: new Float32Array(9),
		} satisfies OrogenProvinces
		const landmarks = {
			regionLandmark: new Int32Array([0, 0, 0, 0, 0]),
			type: new Uint8Array([0]),
			size: new Int32Array([5]),
			count: 1,
		} satisfies OrogenLandmarks
		const climateZones = new Uint8Array([4, 4, 4, 4, 4])
		const vegetation = new Uint8Array([4, 4, 4, 4, 4])
		const topography = new Uint8Array([0, 0, 0, 0, 0])
		const coastal = new Uint8Array([0, 1, 0, 0, 1])
		const riverVisible = new Uint8Array([0, 0, 0, 1, 1])
		const seed = 321

		const result = computePopulation(
			provinces,
			landmarks,
			climateZones,
			vegetation,
			topography,
			coastal,
			riverVisible,
			seed,
			1,
			5,
		)

		const rng = createRng(seed + 77777)
		const baseScore =
			HAB_CLIMATE[4] * HAB_VEGETATION[4] * HAB_TOPOGRAPHY[0] * HAB_LANDMARK[0]
		const regionScores = [
			baseScore * HAB_COASTAL * (0.8 + rng.random() * 0.4),
			baseScore * HAB_COASTAL * (0.8 + rng.random() * 0.4),
			baseScore * HAB_COASTAL * (0.8 + rng.random() * 0.4),
		]

		expect(result.habitability[0]).toBeCloseTo(
			regionScores[0] + regionScores[1],
			5,
		)
		expect(result.habitability[1]).toBeCloseTo(regionScores[2], 5)
		expect(result.habitability[2]).toBe(0)
	})

	it("falls back to zero for unsupported region codes and leaves empty worlds unpopulated", () => {
		const provinces = {
			regionProvince: new Int32Array([0]),
			seeds: new Int32Array([0]),
			count: 1,
			desolate: new Uint8Array([0]),
			landmassId: new Int32Array([0]),
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(),
			size: new Int32Array([1]),
			colors: new Float32Array(3),
		} satisfies OrogenProvinces
		const landmarks = {
			regionLandmark: new Int32Array([0]),
			type: new Uint8Array([99]),
			size: new Int32Array([1]),
			count: 1,
		} satisfies OrogenLandmarks

		const result = computePopulation(
			provinces,
			landmarks,
			new Uint8Array([99]),
			new Uint8Array([99]),
			new Uint8Array([99]),
			new Uint8Array([0]),
			new Uint8Array([0]),
			999,
		)

		expect(result.habitability[0]).toBe(0)
		expect(result.population[0]).toBe(0)
		expect(result.habitabilityScore).toBe(0)
		expect(result.totalPopulation).toBe(0)
	})
})
