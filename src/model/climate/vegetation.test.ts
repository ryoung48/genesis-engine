import { describe, expect, it } from "vitest"
import type { GenesisClimate, GenesisRainfall, SphereMesh } from ".."
import {
	assignClimateZones,
	assignVegetation,
	RAINFALL_BLEND_HALF_WIDTH,
} from "./vegetation"

const H = RAINFALL_BLEND_HALF_WIDTH

function makeMesh(numRegions: number): SphereMesh {
	return {
		numRegions,
		r_xyz: new Float32Array(numRegions * 3),
		adjList: new Int32Array(0),
		adjOffset: new Int32Array(numRegions + 1),
	} as SphereMesh
}

/** RNG that always returns `v` — useful to force a deterministic side of a blend. */
const fixedRng = (v: number) => () => v

describe("assignClimateZones", () => {
	it("classifies ocean, cold, temperate, tropical, infernal, and chaotic cells", () => {
		const climate = {
			temperature_avg: new Float32Array([-20, -10, 10, 26, 45, 20]),
			temperature_min: new Float32Array([-25, -12, 2, 24, 41, -5]),
			temperature_max: new Float32Array([-15, -8, 16, 29, 49, 45]),
		} as GenesisClimate

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
		} as GenesisClimate

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
		} as GenesisClimate
		const rainfall = {
			annual: new Float32Array([0, 600, 1200, 400, 2500, 700, 150]),
		} as GenesisRainfall

		// All rain values are outside blend zones, so rng is never consulted.
		const biome = assignVegetation(
			makeMesh(7),
			new Uint8Array([0, 1, 1, 1, 1, 1, 1]),
			climate,
			rainfall,
			fixedRng(0),
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

	it("biome is deterministic outside the rainfall blend zone", () => {
		// Values are placed at least H+1 mm away from each threshold so rng is
		// never consulted. Using fixedRng(0.5) to confirm it is not called in a
		// way that could influence the result.
		const rng = fixedRng(0.5)

		// Layout: subarctic(×2) | boreal(×6) | temperate(×2) | subtropical(×2) | tropical(×2)
		// For each zone a value strictly below the blend lower edge and one strictly
		// above the blend upper edge are paired so both outcomes are verified.
		const climate = {
			temperature_avg: new Float32Array([
				-10,
				-10, // subarctic
				0,
				0,
				0,
				0,
				0,
				0, // boreal
				12,
				12, // temperate
				20,
				20, // subtropical
				30,
				30, // tropical
			]),
		} as GenesisClimate
		const rainfall = {
			annual: new Float32Array([
				199,
				301, // subarctic: below / above DRY blend [200,300]
				49,
				151, // boreal: below / above ARID blend [50,150]
				449,
				551, // boreal: below / above LOW blend [450,550]
				849,
				951, // boreal: below / above MOD blend [850,950]
				49,
				951, // temperate: below ARID blend / above MOD blend
				2149,
				2251, // subtropical: below / above WET blend [2150,2250]
				1449,
				1551, // tropical: below / above MOIST blend [1450,1550]
			]),
		} as GenesisRainfall

		const biome = assignVegetation(
			makeMesh(14),
			new Uint8Array(14).fill(1),
			climate,
			rainfall,
			rng,
		)

		expect(Array.from(biome)).toEqual([
			1, // subarctic below DRY blend → desert
			2, // subarctic above DRY blend → sparse
			1, // boreal below ARID blend → desert
			2, // boreal above ARID blend → sparse
			3, // boreal below LOW blend (above DRY blend) → grasslands
			4, // boreal above LOW blend → woods
			4, // boreal below MOD blend (above LOW blend) → woods
			5, // boreal above MOD blend → forest
			1, // temperate below ARID blend → desert
			5, // temperate above MOD blend → forest
			5, // subtropical below WET blend (above MOD blend) → forest
			6, // subtropical above WET blend → jungle
			5, // tropical below MOIST blend (above MOD blend) → forest
			6, // tropical above MOIST blend → jungle
		])
	})

	it("biome transitions are probabilistic within the rainfall blend zone", () => {
		// At rain == threshold the blend factor t == 0.5.
		// rng() < 0.5  → probAbove returns true  (higher biome)
		// rng() >= 0.5 → probAbove returns false (lower biome, falls to next check)

		// Boreal zone: rain at DRY threshold (250), t = 0.5
		//   rng=0.3 → above DRY → grasslands (3)
		//   rng=0.7 → below DRY, above ARID(250>=150) → sparse (2)
		const boreals_high = assignVegetation(
			makeMesh(1),
			new Uint8Array([1]),
			{ temperature_avg: new Float32Array([0]) } as GenesisClimate,
			{ annual: new Float32Array([250]) } as GenesisRainfall,
			fixedRng(0.3),
		)
		const boreals_low = assignVegetation(
			makeMesh(1),
			new Uint8Array([1]),
			{ temperature_avg: new Float32Array([0]) } as GenesisClimate,
			{ annual: new Float32Array([250]) } as GenesisRainfall,
			fixedRng(0.7),
		)
		expect(boreals_high[0]).toBe(3) // grasslands
		expect(boreals_low[0]).toBe(2) // sparse

		// Subtropical zone: rain at WET threshold (2200), t = 0.5
		//   rng=0.3 → above WET → jungle (6)
		//   rng=0.7 → below WET, above MOD (2200>=950) → forest (5)
		const subtropical_high = assignVegetation(
			makeMesh(1),
			new Uint8Array([1]),
			{ temperature_avg: new Float32Array([20]) } as GenesisClimate,
			{ annual: new Float32Array([2200]) } as GenesisRainfall,
			fixedRng(0.3),
		)
		const subtropical_low = assignVegetation(
			makeMesh(1),
			new Uint8Array([1]),
			{ temperature_avg: new Float32Array([20]) } as GenesisClimate,
			{ annual: new Float32Array([2200]) } as GenesisRainfall,
			fixedRng(0.7),
		)
		expect(subtropical_high[0]).toBe(6) // jungle
		expect(subtropical_low[0]).toBe(5) // forest

		// Blend boundaries are inclusive: at threshold − H the lower biome is certain,
		// at threshold + H the higher biome is certain regardless of rng.
		const at_lower_edge = assignVegetation(
			makeMesh(1),
			new Uint8Array([1]),
			{ temperature_avg: new Float32Array([0]) } as GenesisClimate,
			{ annual: new Float32Array([250 - H]) } as GenesisRainfall,
			fixedRng(0), // low rng would normally give higher biome
		)
		const at_upper_edge = assignVegetation(
			makeMesh(1),
			new Uint8Array([1]),
			{ temperature_avg: new Float32Array([0]) } as GenesisClimate,
			{ annual: new Float32Array([250 + H]) } as GenesisRainfall,
			fixedRng(1), // high rng would normally give lower biome
		)
		expect(at_lower_edge[0]).toBe(2) // sparse: below DRY, above ARID(200>=150)
		expect(at_upper_edge[0]).toBe(3) // grasslands: deterministically above DRY
	})

	it("treats exact chaos limits as non-chaotic and only marks infernal heat above the max", () => {
		const climate = {
			temperature_avg: new Float32Array([40, 41, 30, 30]),
			temperature_min: new Float32Array([0, 0, -1, 0]),
			temperature_max: new Float32Array([40, 40, 40, 41]),
		} as GenesisClimate

		const zones = assignClimateZones(
			makeMesh(4),
			new Uint8Array([1, 1, 1, 1]),
			climate,
		)

		expect(Array.from(zones)).toEqual([
			6, // exact chaos bounds stay tropical
			7, // avg above the max becomes infernal
			6, // min must be below zero to become chaotic
			8, // max above forty becomes chaotic
		])
	})
})
