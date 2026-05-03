import { describe, expect, it } from "vitest"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import {
	buildClimateSwatchColor,
	buildHoverChartData,
	buildPastaMonthlyData,
	buildProvinceDisplayData,
	buildTerrainFeatureSwatches,
	buildTopographySwatchColor,
	buildVegetationSwatchColor,
} from "./info-panel-model"

function makeWorld(overrides: Record<string, unknown>): SerializedOrogenWorld {
	return {
		mesh: { numRegions: 1 },
		...overrides,
	} as unknown as SerializedOrogenWorld
}

describe("buildHoverChartData", () => {
	it("collects monthly climate and hydrology series for the hovered region", () => {
		const world = makeWorld({
			mesh: { numRegions: 2 },
			climate: {
				temperature_monthly: new Float32Array(
					Array.from({ length: 24 }, (_, index) => index),
				),
				daylight_hours_monthly: new Float32Array(
					Array.from({ length: 24 }, (_, index) => index + 100),
				),
				pet_monthly: new Float32Array(
					Array.from({ length: 24 }, (_, index) => index + 200),
				),
			},
			rainfall: {
				monthly: new Float32Array(
					Array.from({ length: 24 }, (_, index) => index + 300),
				),
			},
			hydrology: {
				aet_monthly: new Float32Array(
					Array.from({ length: 24 }, (_, index) => index + 400),
				),
			},
			isLand: new Uint8Array([1, 0]),
			iceThickness: new Float32Array([2, 3]),
			iceMinMonthly: new Float32Array([4, 5]),
			iceMaxMonthly: new Float32Array([6, 7]),
		})

		const result = buildHoverChartData({ region: 1 } as never, 1.2, world)

		expect(result?.temps).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23])
		expect(result?.precip[0]).toBe(301)
		expect(result?.daylight[11]).toBe(123)
		expect(result?.pet[0]).toBe(201)
		expect(result?.aet[11]).toBe(423)
		expect(result).toMatchObject({
			isLand: 0,
			iceThickness: 3,
			iceMin: 5,
			iceMax: 7,
		})
	})

	it("returns null without a hover target and zero-fills missing climate series", () => {
		expect(buildHoverChartData(null, 1, makeWorld({}))).toBeNull()

		const result = buildHoverChartData({ region: 0 } as never, 0, makeWorld({}))

		expect(result?.temps).toEqual(new Array(12).fill(0))
		expect(result?.precip).toEqual(new Array(12).fill(0))
		expect(result?.daylight).toEqual(new Array(12).fill(0))
		expect(result?.pet).toEqual(new Array(12).fill(0))
		expect(result?.aet).toEqual(new Array(12).fill(0))
	})
})

describe("buildPastaMonthlyData", () => {
	it("returns parallel GDD and GINT monthly slices for the hovered region", () => {
		const world = makeWorld({
			mesh: { numRegions: 2 },
			pastaDebug: {
				gdd_monthly: new Float32Array(
					Array.from({ length: 24 }, (_, index) => index),
				),
				gint_monthly: new Float32Array(
					Array.from({ length: 24 }, (_, index) => index + 50),
				),
			},
		})

		const result = buildPastaMonthlyData({ region: 0 } as never, world)

		expect(result?.gdd).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22])
		expect(result?.gint).toEqual([
			50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72,
		])
	})

	it("returns null without complete pasta debug buffers", () => {
		expect(buildPastaMonthlyData(null, makeWorld({}))).toBeNull()
		expect(
			buildPastaMonthlyData(
				{ region: 0 } as never,
				makeWorld({
					pastaDebug: {
						gdd_monthly: new Float32Array(12),
					},
				}),
			),
		).toBeNull()
	})
})

describe("buildTerrainFeatureSwatches", () => {
	it("deduplicates dominant and secondary terrain features", () => {
		const swatches = buildTerrainFeatureSwatches({
			dominant: "rift valley",
			all: ["rift valley", "plateau uplift", "rift valley"],
		} as never)

		expect(swatches.map((swatch) => swatch.label)).toEqual([
			"rift valley",
			"plateau uplift",
		])
		expect(
			swatches.every(
				(swatch) => swatch.color === null || swatch.color.startsWith("rgb"),
			),
		).toBe(true)
	})

	it("returns empty swatches for null input and keeps unknown features colorless", () => {
		expect(buildTerrainFeatureSwatches(null)).toEqual([])
		expect(
			buildTerrainFeatureSwatches({
				dominant: "mystery ridge",
				all: [],
			} as never),
		).toEqual([{ label: "mystery ridge", color: null }])
	})
})

describe("buildProvinceDisplayData", () => {
	it("returns province and nation colors when the hovered province is valid", () => {
		const result = buildProvinceDisplayData({
			hoverProvince: 1,
			hoverNationId: 7,
			hoverRegionColor: [0.1, 0.2, 0.3],
			world: makeWorld({
				nations: {
					assignment: new Int32Array([0, 7]),
				},
				provinces: {
					colors: new Float32Array([1, 0, 0, 0, 1, 0]),
				},
			}),
		})

		expect(result.regionDisplayColor).toMatch(/^rgb/)
		expect(result.provinceColor).toMatch(/^rgb/)
		expect(result.provinceNation).toEqual({
			id: 7,
			color: result.regionDisplayColor,
		})
	})

	it("returns null province details for invalid province and color inputs", () => {
		const result = buildProvinceDisplayData({
			hoverProvince: -1,
			hoverNationId: null,
			hoverRegionColor: null,
			world: makeWorld({
				nations: {
					assignment: new Int32Array([0]),
				},
				provinces: {
					colors: new Float32Array([1, 0, 0]),
				},
			}),
		})

		expect(result).toEqual({
			provinceColor: null,
			provinceNation: null,
			regionDisplayColor: null,
		})
	})
})

describe("buildClimateSwatchColor", () => {
	it("returns null when hoverRegion is null", () => {
		expect(buildClimateSwatchColor(null, makeWorld({}), "terrain")).toBeNull()
	})

	it("returns null when world is null", () => {
		expect(buildClimateSwatchColor(0, null, "terrain")).toBeNull()
	})

	it("returns null when no climate zones or matching mode data", () => {
		const world = makeWorld({ climateZones: undefined })
		expect(buildClimateSwatchColor(0, world, "terrain")).toBeNull()
	})

	it("returns a css color string for pastaClimate mode", () => {
		const world = makeWorld({ pastaClimate: new Uint8Array([3]) })
		const result = buildClimateSwatchColor(0, world, "pastaClimate")
		expect(result).toMatch(/^rgb/)
	})

	it("returns a css color string for koppenClimate mode", () => {
		const world = makeWorld({ koppenClimate: new Uint8Array([1]) })
		const result = buildClimateSwatchColor(0, world, "koppenClimate")
		expect(result).toMatch(/^rgb/)
	})

	it("falls back to climateZone color when mode is terrain", () => {
		const world = makeWorld({ climateZones: new Uint8Array([2]) })
		const result = buildClimateSwatchColor(0, world, "terrain")
		expect(result).toMatch(/^rgb/)
	})

	it("supports temperature and koppen climate color modes", () => {
		expect(
			buildClimateSwatchColor(
				0,
				makeWorld({
					climateZones: new Uint8Array([1]),
					climate: {
						temperature_avg: new Float32Array([12]),
					},
				}),
				"climate",
			),
		).toMatch(/^rgb/)
		expect(
			buildClimateSwatchColor(
				0,
				makeWorld({ koppenClimate: new Uint8Array([1]) }),
				"koppenClimate",
			),
		).toMatch(/^rgb/)
	})
})

describe("buildVegetationSwatchColor", () => {
	it("returns null when hoverRegion is null", () => {
		expect(buildVegetationSwatchColor(null, makeWorld({}))).toBeNull()
	})

	it("returns null when world has no vegetation", () => {
		expect(buildVegetationSwatchColor(0, makeWorld({}))).toBeNull()
	})

	it("returns a css color string for valid region", () => {
		const world = makeWorld({ vegetation: new Uint8Array([1]) })
		const result = buildVegetationSwatchColor(0, world)
		expect(result).toMatch(/^rgb/)
	})
})

describe("buildTopographySwatchColor", () => {
	it("returns null when hoverRegion is null", () => {
		expect(buildTopographySwatchColor(null, makeWorld({}))).toBeNull()
	})

	it("returns null when world has no topography", () => {
		expect(buildTopographySwatchColor(0, makeWorld({}))).toBeNull()
	})

	it("returns a css color string for a land topography index", () => {
		const world = makeWorld({ topography: new Uint8Array([1]) })
		const result = buildTopographySwatchColor(0, world)
		expect(result).toMatch(/^rgb/)
	})

	it("returns null when the topography palette has no matching entry", () => {
		expect(
			buildTopographySwatchColor(
				0,
				makeWorld({ topography: new Uint8Array([99]) }),
			),
		).toBeNull()
	})
})
