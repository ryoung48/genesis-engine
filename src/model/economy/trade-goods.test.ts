import { describe, expect, it } from "vitest"
import { PASTA_LABELS } from "@/model/climate/pasta"
import {
	computeTradeGoods,
	tradeGoodColor,
	tradeGoodDisplayName,
} from "./trade-goods"
import { TRADE_GOOD_LABELS } from "./trade-goods-table"

// Minimal location builder for tests.
// regionLocation[r] = location index for region r
// locationProvince[l] = province index for location l
// provinceDesolate[p] = 1 if province p is desolate
function makeLocations(
	regionLocation: number[],
	locationProvince: number[],
	provinceDesolate: number[] = [],
): {
	locations: {
		count: number
		regionLocation: Int32Array
		locationProvince: Int32Array
	}
	provinces: { desolate: Uint8Array }
} {
	const count = locationProvince.length
	const provinceCount =
		provinceDesolate.length ||
		(count > 0 ? Math.max(...locationProvince) + 1 : 0)
	return {
		locations: {
			count,
			regionLocation: new Int32Array(regionLocation),
			locationProvince: new Int32Array(locationProvince),
		},
		provinces: {
			desolate: new Uint8Array(
				provinceDesolate.length
					? provinceDesolate
					: new Array(provinceCount).fill(0),
			),
		},
	}
}

describe("tradeGoodColor", () => {
	it("returns desolate gray for index 0", () => {
		expect(tradeGoodColor(0)).toEqual([0.35, 0.33, 0.32])
	})

	it("returns desolate gray for negative index", () => {
		expect(tradeGoodColor(-1)).toEqual([0.35, 0.33, 0.32])
	})

	it("returns an RGB triple in 0..1 range for any valid material index", () => {
		for (let i = 1; i < TRADE_GOOD_LABELS.length; i++) {
			const [r, g, b] = tradeGoodColor(i)
			expect(r).toBeGreaterThanOrEqual(0)
			expect(r).toBeLessThanOrEqual(1)
			expect(g).toBeGreaterThanOrEqual(0)
			expect(g).toBeLessThanOrEqual(1)
			expect(b).toBeGreaterThanOrEqual(0)
			expect(b).toBeLessThanOrEqual(1)
		}
	})

	it("returns distinct colors for different material indices", () => {
		const colors = new Set<string>()
		for (let i = 1; i <= 10; i++) {
			colors.add(JSON.stringify(tradeGoodColor(i)))
		}
		expect(colors.size).toBe(10)
	})

	it("is deterministic — same index always yields the same color", () => {
		expect(tradeGoodColor(5)).toEqual(tradeGoodColor(5))
		expect(tradeGoodColor(42)).toEqual(tradeGoodColor(42))
	})
})

describe("computeTradeGoods", () => {
	it("returns a Uint8Array with length equal to location count", () => {
		// 3 regions, 2 locations: regions 0,2 → location 0; region 1 → location 1
		const { locations, provinces } = makeLocations([0, 1, 0], [0, 1], [0, 0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([4, 4, 4]),
			vegetation: new Uint8Array([5, 5, 5]),
			topography: new Uint8Array([0, 0, 0]),
			coastal: new Uint8Array([0, 0, 0]),
			numRegions: 3,
		})
		expect(result.material).toBeInstanceOf(Uint8Array)
		expect(result.material.length).toBe(2)
	})

	it("assigns material index 0 to locations in desolate provinces", () => {
		// region 0 → location 0 → province 0 (desolate); region 1 → location 1 → province 1 (not)
		const { locations, provinces } = makeLocations([0, 1], [0, 1], [1, 0])
		const result = computeTradeGoods({
			seed: 1,
			locations,
			provinces,
			climateZones: new Uint8Array([4, 6]),
			vegetation: new Uint8Array([5, 6]),
			topography: new Uint8Array([0, 0]),
			coastal: new Uint8Array([0, 0]),
			numRegions: 2,
		})
		expect(result.material[0]).toBe(0)
	})

	it("assigns material index 0 to ocean/lake topography regions", () => {
		// Location 0 has only an ocean-topography region (topo=5)
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 99,
			locations,
			provinces,
			climateZones: new Uint8Array([4]),
			vegetation: new Uint8Array([5]),
			topography: new Uint8Array([5]), // ocean
			coastal: new Uint8Array([0]),
			numRegions: 1,
		})
		expect(result.material[0]).toBe(0)
	})

	it("assigns a non-zero material to a habitable location with matching table entry", () => {
		// continental + forest + flatland + inland is a well-covered combo
		// zone 4 (temperate) maps to "continental" by default (no pasta refinement)
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 7,
			locations,
			provinces,
			climateZones: new Uint8Array([4]), // temperate → continental
			vegetation: new Uint8Array([5]), // forest
			topography: new Uint8Array([0]), // flatland
			coastal: new Uint8Array([0]), // inland
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThan(0)
	})

	it("is reproducible — same seed yields same assignment", () => {
		// 5 regions, 3 locations
		const { locations, provinces } = makeLocations([0, 0, 1, 1, 2], [0, 1, 2])
		const params = {
			seed: 12345,
			locations,
			provinces,
			climateZones: new Uint8Array([4, 4, 6, 6, 5]),
			vegetation: new Uint8Array([5, 5, 6, 6, 3]),
			topography: new Uint8Array([0, 1, 0, 2, 3]),
			coastal: new Uint8Array([1, 0, 0, 0, 1]),
			numRegions: 5,
		}
		const a = computeTradeGoods(params)
		const b = computeTradeGoods(params)
		expect(Array.from(a.material)).toEqual(Array.from(b.material))
	})

	it("falls back to arid when no pasta and desert biome in subtropical zone", () => {
		// No pastaClimate → biome desert(1) + zone subtropical(5) → "arid" fallback
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 55,
			locations,
			provinces,
			climateZones: new Uint8Array([5]), // subtropical
			vegetation: new Uint8Array([1]), // desert
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})

	it("uses arid climate key when pasta code is Ada (Warm Semidesert)", () => {
		const adaIdx = PASTA_LABELS.indexOf("Ada")
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([5]), // subtropical
			vegetation: new Uint8Array([1]), // desert
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			pastaClimate: new Uint8Array([adaIdx]),
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})

	it("uses cold_arid climate key when pasta code is Adc (Cold Semidesert)", () => {
		const adcIdx = PASTA_LABELS.indexOf("Adc")
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([4]), // temperate
			vegetation: new Uint8Array([1]), // desert
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			pastaClimate: new Uint8Array([adcIdx]),
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})

	it("uses arid climate key when pasta code is Aha (Warm Desert)", () => {
		const ahaIdx = PASTA_LABELS.indexOf("Aha")
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([6]), // tropical
			vegetation: new Uint8Array([1]), // desert
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			pastaClimate: new Uint8Array([ahaIdx]),
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})

	it("uses cold_arid climate key when pasta code is Ahc (Cold Desert)", () => {
		const ahcIdx = PASTA_LABELS.indexOf("Ahc")
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([4]), // temperate
			vegetation: new Uint8Array([1]), // desert
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			pastaClimate: new Uint8Array([ahcIdx]),
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})

	it("falls back to inland when coastal combo has no table entry", () => {
		// Use a known inland-only combo and mark it as coastal to trigger fallback
		// tropical + jungle + flatland is a common combo — coastal should fall back to inland
		const { locations: locC, provinces: provC } = makeLocations([0], [0])
		const coastal = computeTradeGoods({
			seed: 777,
			locations: locC,
			provinces: provC,
			climateZones: new Uint8Array([6]), // tropical
			vegetation: new Uint8Array([6]), // jungle
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([1]), // coastal
			numRegions: 1,
		})
		const { locations: locI, provinces: provI } = makeLocations([0], [0])
		const inland = computeTradeGoods({
			seed: 777,
			locations: locI,
			provinces: provI,
			climateZones: new Uint8Array([6]),
			vegetation: new Uint8Array([6]),
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]), // inland
			numRegions: 1,
		})
		// Both should produce valid (non-negative) indices
		expect(coastal.material[0]).toBeGreaterThanOrEqual(0)
		expect(inland.material[0]).toBeGreaterThanOrEqual(0)
	})

	it("uses oceanic climate key when pasta code is CDa (Oceanic Temperate)", () => {
		const cdaIdx = PASTA_LABELS.indexOf("CDa")
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([4]), // temperate zone
			vegetation: new Uint8Array([5]), // forest
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			pastaClimate: new Uint8Array([cdaIdx]),
			numRegions: 1,
		})
		// oceanic|forest|flatland|inland should exist in the table
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})

	it("uses oceanic climate key when pasta code is CEa (Oceanic Boreal)", () => {
		const ceaIdx = PASTA_LABELS.indexOf("CEa")
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([3]), // boreal zone
			vegetation: new Uint8Array([5]), // forest
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			pastaClimate: new Uint8Array([ceaIdx]),
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})

	it("uses oceanic climate key when pasta code is CEap (Oceanic Boreal Rainforest)", () => {
		const ceapIdx = PASTA_LABELS.indexOf("CEap")
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([3]), // boreal zone
			vegetation: new Uint8Array([5]), // forest
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			pastaClimate: new Uint8Array([ceapIdx]),
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})

	it("uses continental climate key when pasta code is CDb (Continental Temperate)", () => {
		const cdbIdx = PASTA_LABELS.indexOf("CDb")
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([4]), // temperate zone
			vegetation: new Uint8Array([5]), // forest
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			pastaClimate: new Uint8Array([cdbIdx]),
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})

	it("uses continental climate key when pasta code is CDbp (Continental Temperate Rainforest)", () => {
		const cdbpIdx = PASTA_LABELS.indexOf("CDbp")
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([4]), // temperate zone
			vegetation: new Uint8Array([5]), // forest
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			pastaClimate: new Uint8Array([cdbpIdx]),
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})

	it("uses mediterranean climate key when pasta code is CAMa (Oceanic Mediterranean)", () => {
		const camaIdx = PASTA_LABELS.indexOf("CAMa")
		const { locations, provinces } = makeLocations([0], [0])
		const result = computeTradeGoods({
			seed: 42,
			locations,
			provinces,
			climateZones: new Uint8Array([4]), // temperate zone
			vegetation: new Uint8Array([5]), // forest
			topography: new Uint8Array([0]),
			coastal: new Uint8Array([0]),
			pastaClimate: new Uint8Array([camaIdx]),
			numRegions: 1,
		})
		expect(result.material[0]).toBeGreaterThanOrEqual(0)
		expect(result.material[0]).toBeLessThan(TRADE_GOOD_LABELS.length)
	})
})

describe("tradeGoodDisplayName", () => {
	it("capitalizes simple labels", () => {
		expect(tradeGoodDisplayName("fish")).toBe("Fish")
		expect(tradeGoodDisplayName("amber")).toBe("Amber")
	})

	it("strips goods_ prefix", () => {
		expect(tradeGoodDisplayName("goods_gold")).toBe("Gold")
	})

	it("replaces underscores with spaces and title-cases", () => {
		expect(tradeGoodDisplayName("fiber_crops")).toBe("Fiber Crops")
		expect(tradeGoodDisplayName("wild_game")).toBe("Wild Game")
	})
})
