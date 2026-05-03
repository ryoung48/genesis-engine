import { describe, expect, it } from "vitest"
import type { OrogenClimate, OrogenRainfall, SphereMesh } from ".."
import { assignClimateZones, assignVegetation } from "./vegetation"

function makeMesh(numRegions: number): SphereMesh {
	return {
		numRegions,
		r_xyz: new Float32Array(numRegions * 3),
		adjList: new Int32Array(0),
		adjOffset: new Int32Array(numRegions + 1),
	} as SphereMesh
}

describe("assignClimateZones", () => {
	it("classifies ocean, cold, temperate, tropical, infernal, and chaotic cells", () => {
		const climate = {
			temperature_avg: new Float32Array([-20, -10, 10, 26, 45, 20]),
			temperature_min: new Float32Array([-25, -12, 2, 24, 41, -5]),
			temperature_max: new Float32Array([-15, -8, 16, 29, 49, 45]),
		} as OrogenClimate

		const zones = assignClimateZones(
			makeMesh(6),
			new Uint8Array([0, 1, 1, 1, 1, 1]),
			climate,
		)

		expect(Array.from(zones)).toEqual([0, 2, 4, 6, 7, 8])
	})

	it("keeps exact temperature boundaries in the colder zone and prioritizes chaos over infernal heat", () => {
		const climate = {
			temperature_avg: new Float32Array([-14, -6, 6, 16, 24, 45]),
			temperature_min: new Float32Array([-20, -10, 0, 8, 18, -5]),
			temperature_max: new Float32Array([-14, -6, 6, 16, 24, 45]),
		} as OrogenClimate

		const zones = assignClimateZones(
			makeMesh(6),
			new Uint8Array([1, 1, 1, 1, 1, 1]),
			climate,
		)

		expect(Array.from(zones)).toEqual([
			1, // arctic
			2, // subarctic
			3, // boreal
			4, // temperate
			5, // subtropical
			8, // chaotic takes precedence over infernal
		])
	})
})

describe("assignVegetation", () => {
	it("maps rainfall and temperature bands to the expected biome classes", () => {
		const climate = {
			temperature_avg: new Float32Array([-20, -10, 0, 12, 20, 28, 30]),
		} as OrogenClimate
		const rainfall = {
			annual: new Float32Array([0, 600, 1200, 400, 2500, 700, 150]),
		} as OrogenRainfall

		const biome = assignVegetation(
			makeMesh(7),
			new Uint8Array([0, 1, 1, 1, 1, 1, 1]),
			climate,
			rainfall,
		)

		expect(Array.from(biome)).toEqual([
			0, // ocean
			2, // sparse tundra
			5, // boreal forest
			3, // temperate grasslands
			6, // subtropical jungle
			4, // tropical woods
			2, // tropical sparse
		])
	})

	it("uses strict rainfall thresholds across each biome band", () => {
		const climate = {
			temperature_avg: new Float32Array([
				-20, -10, -10, 0, 0, 0, 0, 12, 12, 12, 20, 20, 20, 30, 30, 30,
			]),
		} as OrogenClimate
		const rainfall = {
			annual: new Float32Array([
				0, 250, 251, 100, 101, 500, 901, 250, 251, 901, 2200, 2201, 501, 250,
				251, 1501,
			]),
		} as OrogenRainfall

		const biome = assignVegetation(
			makeMesh(16),
			new Uint8Array(16).fill(1),
			climate,
			rainfall,
		)

		expect(Array.from(biome)).toEqual([
			1, // arctic ice desert
			1, // subarctic exact DRY stays desert
			2, // subarctic above DRY becomes sparse
			1, // boreal exact arid threshold stays desert
			2, // boreal above arid threshold becomes sparse
			3, // boreal exact LOW stays grasslands
			5, // boreal above MOD becomes forest
			2, // temperate exact DRY still exceeds the arid threshold
			3, // temperate above DRY becomes grasslands
			5, // temperate above MOD becomes forest
			5, // subtropical exact WET stays forest
			6, // subtropical above WET becomes jungle
			4, // subtropical above LOW becomes woods
			2, // tropical exact DRY still exceeds the arid threshold
			3, // tropical above DRY becomes grasslands
			6, // tropical above MOIST becomes jungle
		])
	})

	it("covers remaining exact drought and woodland thresholds across warm bands", () => {
		const climate = {
			temperature_avg: new Float32Array([
				0, 12, 12, 12, 20, 20, 20, 20, 30, 30,
			]),
		} as OrogenClimate
		const rainfall = {
			annual: new Float32Array([
				501, 100, 501, 1501, 100, 101, 251, 1500, 100, 101,
			]),
		} as OrogenRainfall

		const biome = assignVegetation(
			makeMesh(10),
			new Uint8Array(10).fill(1),
			climate,
			rainfall,
		)

		expect(Array.from(biome)).toEqual([
			4, // boreal above LOW becomes woods
			1, // temperate exact arid threshold stays desert
			4, // temperate above LOW becomes woods
			5, // temperate above MOIST remains forest
			1, // subtropical exact arid threshold stays desert
			2, // subtropical above arid threshold becomes sparse
			3, // subtropical above DRY becomes grasslands
			5, // subtropical exact MOIST remains forest
			1, // tropical exact arid threshold stays desert
			2, // tropical above arid threshold becomes sparse
		])
	})

	it("treats exact chaos limits as non-chaotic and only marks infernal heat above the max", () => {
		const climate = {
			temperature_avg: new Float32Array([40, 41, 30, 30]),
			temperature_min: new Float32Array([0, 0, -1, 0]),
			temperature_max: new Float32Array([40, 40, 40, 41]),
		} as OrogenClimate

		const zones = assignClimateZones(
			makeMesh(4),
			new Uint8Array([1, 1, 1, 1]),
			climate,
		)

		expect(Array.from(zones)).toEqual([
			6, // exact chaos bounds stay tropical
			7, // avg above the max becomes infernal
			6, // min must be below zero to become chaotic
			6, // max must be above forty to become chaotic
		])
	})
})
