import { describe, expect, it } from "vitest"
import { OROGEN_TERRAIN_FEATURE } from "@/model"
import { koppenClimateColor } from "@/model/climate/koppen"
import { pastaClimateColor } from "@/model/climate/pasta"
import { CHAOTIC_MAX, CHAOTIC_MIN } from "@/model/climate/vegetation"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import {
	climateTempColor,
	climateZoneColor,
	dangerMapColor,
	developmentColor,
	dtrColor,
	getColor,
	hotspotColor,
	moistureDirectionalColor,
	OCEAN_LIGHT_BLUE,
	oceanCurrentColor,
	populationColor,
	precipitationAnnualColor,
	precipitationColor,
	slopeColor,
	temperatureColor,
	temperatureDeltaColor,
	vegetationColor,
} from "../../colors"
import type { NationMapMode, PopulationMapMode } from "../shared/map-modes"
import {
	darkenClimateAtElevation,
	darkenPoliticalAtElevation,
	darkenVegetationAtElevation,
} from "./color-helpers"
import {
	computeRegionColors,
	getTerrainFeatureColor,
	getTopographyColor,
} from "./region-colors"

function expectRgbCloseTo(
	actual: Float32Array,
	expected: [number, number, number],
) {
	expect(actual).toHaveLength(3)
	for (let i = 0; i < expected.length; i++) {
		expect(actual[i]).toBeCloseTo(expected[i], 6)
	}
}

function buildWorld(
	overrides: Partial<SerializedOrogenWorld>,
): SerializedOrogenWorld {
	return {
		mesh: { numRegions: 2 },
		elevation: new Float32Array([1, -1]),
		elevation_km: new Float32Array([0, -1]),
		isLand: new Uint8Array([1, 0]),
		...overrides,
	} as unknown as SerializedOrogenWorld
}

function expectRegionColor(
	rgb: Float32Array,
	region: number,
	expected: [number, number, number],
) {
	expectRgbCloseTo(rgb.subarray(region * 3, region * 3 + 3), expected)
}

function blendRgb(
	base: [number, number, number],
	tint: [number, number, number],
	t: number,
): [number, number, number] {
	return [
		base[0] + (tint[0] - base[0]) * t,
		base[1] + (tint[1] - base[1]) * t,
		base[2] + (tint[2] - base[2]) * t,
	]
}

const DEFAULT_NATION_MODE: NationMapMode = "borders"
const DEFAULT_POPULATION_MODE: PopulationMapMode = "density"

describe("computeRegionColors", () => {
	it("defers grayscale mode to mesh-based smoothing", () => {
		const world = buildWorld({})

		const rgb = computeRegionColors(
			world,
			"landHeightmap",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expect(rgb).toBeNull()
	})

	it("returns known terrain feature and topography colors", () => {
		expect(getTerrainFeatureColor(OROGEN_TERRAIN_FEATURE.TRENCH)).toEqual([
			0.07, 0.17, 0.46,
		])
		expect(getTerrainFeatureColor(999)).toBeNull()
		expect(getTopographyColor(3)).toEqual([0x6c / 255, 0x2c / 255, 0x14 / 255])
		expect(getTopographyColor(999)).toBeNull()
	})

	it("uses annual precipitation thresholds for annual rainfall mode", () => {
		const world = buildWorld({
			rainfall: {
				annual: new Float32Array([120, 50]),
				monthly: new Float32Array(24),
				east: new Float32Array([0, 0]),
				west: new Float32Array([0, 0]),
			},
		})

		const rgb = computeRegionColors(
			world,
			"precipitation",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expect(rgb).not.toBeNull()
		expectRegionColor(rgb!, 0, precipitationAnnualColor(120))
		expectRegionColor(rgb!, 1, OCEAN_LIGHT_BLUE)
	})

	it("uses monthly moisture colors and darkens water cells in map view", () => {
		const world = buildWorld({
			rainfall: {
				annual: new Float32Array([0, 0]),
				monthly: new Float32Array(24),
				east: new Float32Array([0.36, 0.8]),
				west: new Float32Array([0.35, 0.1]),
			},
		})

		const rgb = computeRegionColors(
			world,
			"moisture",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			1,
			0,
			0,
			"map",
		)

		expect(rgb).not.toBeNull()
		expectRegionColor(rgb!, 0, moistureDirectionalColor(0.36, true))
		expectRegionColor(rgb!, 1, [
			moistureDirectionalColor(0.8, true)[0] * 0.74,
			moistureDirectionalColor(0.8, true)[1] * 0.74,
			moistureDirectionalColor(0.8, true)[2] * 0.74,
		])
	})

	it("uses the mixed hazard tint for danger zones", () => {
		const world = buildWorld({
			hazards: {
				danger: new Float32Array([0.4, 0.2]),
				earthquake: new Float32Array([0.1, 0.3]),
				volcano: new Float32Array([1, 0.6]),
			},
		})

		const rgb = computeRegionColors(
			world,
			"dangerZones",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)

		expect(rgb).not.toBeNull()
		expectRegionColor(rgb!, 0, dangerMapColor(0.1, 1))
		expectRegionColor(rgb!, 1, [
			dangerMapColor(0.3, 0.6)[0] * 0.78,
			dangerMapColor(0.3, 0.6)[1] * 0.78,
			dangerMapColor(0.3, 0.6)[2] * 0.78,
		])
	})

	it("applies elevation shading to nation province fills", () => {
		const world = buildWorld({
			elevation_km: new Float32Array([3, -1]),
			provinces: {
				regionProvince: new Int32Array([0, -1]),
				seeds: new Int32Array([0]),
				count: 1,
				desolate: new Uint8Array([0]),
				landmassId: new Int32Array([0]),
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1]),
				colors: new Float32Array([0.8, 0.4, 0.2]),
			},
		})

		const rgb = computeRegionColors(
			world,
			"nations",
			"provinces",
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expect(rgb).not.toBeNull()
		expectRegionColor(rgb!, 0, darkenPoliticalAtElevation([0.8, 0.4, 0.2], 3))
	})

	it("does not apply special occupied shading to nation borders", () => {
		const world = buildWorld({
			elevation_km: new Float32Array([2, -1]),
			provinces: {
				regionProvince: new Int32Array([0, -1]),
				seeds: new Int32Array([0]),
				count: 1,
				desolate: new Uint8Array([0]),
				landmassId: new Int32Array([0]),
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1]),
				colors: new Float32Array([0.1, 0.2, 0.3]),
			},
			nations: {
				assignment: new Int32Array([0]),
				seeds: new Int32Array([0]),
				count: 1,
				adjOffset: new Int32Array([0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1]),
				colors: new Float32Array([0.7, 0.5, 0.3]),
				parent: new Int32Array([-1]),
				depth: new Int32Array([0]),
				childOffset: new Int32Array([0, 0]),
				childList: new Int32Array(0),
				sovereign: new Int32Array([0]),
				gravity: new Float32Array([1]),
			},
		})

		const rgb = computeRegionColors(
			world,
			"nations",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"globe",
			new Set([0]),
		)

		expect(rgb).not.toBeNull()
		expectRegionColor(rgb!, 0, darkenPoliticalAtElevation([0.7, 0.5, 0.3], 2))
	})

	it("renders rebel nations with their loyalist base color in nation borders mode", () => {
		const world = buildWorld({
			elevation_km: new Float32Array([2, 1]),
			provinces: {
				regionProvince: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				desolate: new Uint8Array([0, 0]),
				landmassId: new Int32Array([0, 0]),
				adjOffset: new Int32Array([0, 1, 2]),
				adjList: new Int32Array([1, 0]),
				size: new Int32Array([1, 1]),
				colors: new Float32Array([0.1, 0.2, 0.3, 0.7, 0.1, 0.1]),
			},
			nations: {
				assignment: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				adjOffset: new Int32Array([0, 1, 2]),
				adjList: new Int32Array([1, 0]),
				size: new Int32Array([1, 1]),
				colors: new Float32Array([0.2, 0.3, 0.4, 0.8, 0.1, 0.2]),
				parent: new Int32Array([-1, -1]),
				depth: new Int32Array([0, 0]),
				childOffset: new Int32Array([0, 0, 0]),
				childList: new Int32Array(0),
				sovereign: new Int32Array([0, 1]),
				gravity: new Float32Array([1, 1]),
			},
		})

		const rgb = computeRegionColors(
			world,
			"nations",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"globe",
			undefined,
			[{ idx: 4, attacker: 0, defender: 1, rebel: true, occupied: [] }],
		)

		expectRegionColor(rgb!, 1, darkenPoliticalAtElevation([0.2, 0.3, 0.4], 1))
	})

	it("darkens map water in temperature and moisture views", () => {
		const world = buildWorld({
			climate: {
				temperature_avg: new Float32Array([20, 5]),
				temperature_min: new Float32Array([10, -2]),
				temperature_max: new Float32Array([30, 8]),
				temperature_monthly: new Float32Array(24),
				temperature_monthly_nolapse: new Float32Array(24),
				temperature_monthly_range: new Float32Array(24),
				insolation_monthly: new Float32Array(24),
				pet_monthly: new Float32Array(24),
				daylight_hours_monthly: new Float32Array(24),
				landFraction: [],
			},
			rainfall: {
				annual: new Float32Array([500, 200]),
				monthly: new Float32Array(24),
				east: new Float32Array([0.4, 0.2]),
				west: new Float32Array([0.39, 0.5]),
			},
		})

		const temperature = computeRegionColors(
			world,
			"temperature",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)
		const moisture = computeRegionColors(
			world,
			"moisture",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)

		expect(temperature).not.toBeNull()
		expectRegionColor(temperature!, 0, temperatureColor(20))
		expectRegionColor(temperature!, 1, [
			temperatureColor(5)[0] * 0.74,
			temperatureColor(5)[1] * 0.74,
			temperatureColor(5)[2] * 0.74,
		])

		expect(moisture).not.toBeNull()
		expectRegionColor(moisture!, 0, moistureDirectionalColor(0.4, true))
		expectRegionColor(moisture!, 1, [
			moistureDirectionalColor(0.5, false)[0] * 0.74,
			moistureDirectionalColor(0.5, false)[1] * 0.74,
			moistureDirectionalColor(0.5, false)[2] * 0.74,
		])
	})

	it("falls back to elevation-based water detection when isLand is absent", () => {
		const world = buildWorld({
			isLand: undefined,
			climate: {
				temperature_avg: new Float32Array([18, 6]),
				temperature_min: new Float32Array([12, 2]),
				temperature_max: new Float32Array([24, 10]),
				temperature_monthly: new Float32Array([
					18, 6, 18, 6, 18, 6, 18, 6, 18, 6, 18, 6, 18, 6, 18, 6, 18, 6, 18, 6,
					18, 6, 18, 6,
				]),
				temperature_monthly_nolapse: new Float32Array(24),
				temperature_monthly_range: new Float32Array(24),
				insolation_monthly: new Float32Array(24),
				pet_monthly: new Float32Array(24),
				daylight_hours_monthly: new Float32Array(24),
				landFraction: [],
			},
			rainfall: {
				annual: new Float32Array([0, 0]),
				monthly: new Float32Array(24),
				east: new Float32Array([0.4, 0.2]),
				west: new Float32Array([0.38, 0.5]),
			},
			pastaClimate: new Uint8Array([1, 2]),
		})

		const temperature = computeRegionColors(
			world,
			"temperature",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			1,
			0,
			0,
			0,
			"map",
		)
		const moisture = computeRegionColors(
			world,
			"moisture",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			1,
			0,
			0,
			"map",
		)
		const pasta = computeRegionColors(
			world,
			"pastaClimate",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)

		expectRegionColor(temperature!, 0, temperatureColor(18))
		expectRegionColor(temperature!, 1, [
			temperatureColor(6)[0] * 0.74,
			temperatureColor(6)[1] * 0.74,
			temperatureColor(6)[2] * 0.74,
		])
		expectRegionColor(moisture!, 1, [
			moistureDirectionalColor(0.5, false)[0] * 0.74,
			moistureDirectionalColor(0.5, false)[1] * 0.74,
			moistureDirectionalColor(0.5, false)[2] * 0.74,
		])
		expectRegionColor(pasta!, 1, [
			pastaClimateColor(2)[0] * 0.74,
			pastaClimateColor(2)[1] * 0.74,
			pastaClimateColor(2)[2] * 0.74,
		])
	})

	it("uses default slope and annual moisture fallbacks when supporting arrays are missing", () => {
		const world = buildWorld({
			isLand: undefined,
			slopeScore: undefined,
			rainfall: {
				annual: new Float32Array([0, 0]),
				monthly: new Float32Array(24),
				east: new Float32Array([0.2, 0.4]),
				west: new Float32Array([0.1, 0.35]),
			},
		})

		const slope = computeRegionColors(
			world,
			"slope",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		const moisture = computeRegionColors(
			world,
			"moisture",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)

		expectRegionColor(slope!, 0, [
			slopeColor(0)[0] * 0.45,
			slopeColor(0)[1] * 0.55,
			Math.min(1, slopeColor(0)[2] * 0.8 + 0.18),
		])
		expectRegionColor(slope!, 1, [
			slopeColor(0)[0] * 0.45,
			slopeColor(0)[1] * 0.55,
			Math.min(1, slopeColor(0)[2] * 0.8 + 0.18),
		])
		expectRegionColor(moisture!, 1, [
			moistureDirectionalColor(0.4, true)[0] * 0.74,
			moistureDirectionalColor(0.4, true)[1] * 0.74,
			moistureDirectionalColor(0.4, true)[2] * 0.74,
		])
	})

	it("uses dtr monthly and ocean-current fallbacks when monthly values are missing", () => {
		const world = buildWorld({
			dtr_annual: new Float32Array([6, 4]),
			dtr_monthly: [undefined, 8] as unknown as Float32Array,
			oceanCurrents: {
				oceanWarmth: new Float32Array([0, 0]),
				coastalWarmth: new Float32Array([0, 0]),
				temperatureDelta: undefined,
				temperatureDeltaMonthly: [undefined, -12] as unknown as Float32Array,
			},
		})

		const dtr = computeRegionColors(
			world,
			"dtr",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			1,
			0,
		)
		const currents = computeRegionColors(
			world,
			"oceanCurrents",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			1,
			"map",
		)

		expectRegionColor(dtr!, 0, dtrColor(6))
		expectRegionColor(dtr!, 1, OCEAN_LIGHT_BLUE)
		expectRegionColor(currents!, 0, oceanCurrentColor(0))
		expectRegionColor(currents!, 1, [
			oceanCurrentColor(-12 / 15)[0] * 0.74,
			oceanCurrentColor(-12 / 15)[1] * 0.74,
			oceanCurrentColor(-12 / 15)[2] * 0.74,
		])
	})

	it("uses annual dtr and annual ocean-current data when no monthly view is selected", () => {
		const world = buildWorld({
			isLand: undefined,
			dtr_annual: new Float32Array([7, 5]),
			dtr_monthly: new Float32Array(24),
			oceanCurrents: {
				oceanWarmth: new Float32Array([0, 0]),
				coastalWarmth: new Float32Array([0, 0]),
				temperatureDelta: [undefined, -9] as unknown as Float32Array,
				temperatureDeltaMonthly: new Float32Array(24),
			},
		})

		const dtr = computeRegionColors(
			world,
			"dtr",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		const currents = computeRegionColors(
			world,
			"oceanCurrents",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)

		expectRegionColor(dtr!, 0, OCEAN_LIGHT_BLUE)
		expectRegionColor(dtr!, 1, OCEAN_LIGHT_BLUE)
		expectRegionColor(currents!, 0, [
			oceanCurrentColor(0)[0] * 0.74,
			oceanCurrentColor(0)[1] * 0.74,
			oceanCurrentColor(0)[2] * 0.74,
		])
		expectRegionColor(currents!, 1, [
			oceanCurrentColor(-9 / 15)[0] * 0.74,
			oceanCurrentColor(-9 / 15)[1] * 0.74,
			oceanCurrentColor(-9 / 15)[2] * 0.74,
		])
	})

	it("falls back to neutral population colors when lineage partitions are missing", () => {
		const world = buildWorld({
			provinces: {
				regionProvince: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				desolate: new Uint8Array([0, 0]),
				landmassId: new Int32Array([0, 0]),
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1]),
				colors: new Float32Array([0.1, 0.2, 0.3, 0.3, 0.2, 0.1]),
			},
			population: {
				provincePopulation: new Float32Array([1, 1]),
			} as unknown as SerializedOrogenWorld["population"],
			cultures: {
				assignment: new Int32Array([0, 0]),
				colors: new Float32Array([0.2, 0.4, 0.6]),
			} as SerializedOrogenWorld["cultures"],
			heritages: {
				assignment: [undefined] as unknown as Int32Array,
				colors: new Float32Array([0.4, 0.5, 0.6]),
			} as SerializedOrogenWorld["heritages"],
			faiths: {
				assignment: [undefined] as unknown as Int32Array,
				colors: new Float32Array([0.6, 0.5, 0.4]),
			} as SerializedOrogenWorld["faiths"],
			religions: {
				assignment: [undefined] as unknown as Int32Array,
				colors: new Float32Array([0.7, 0.4, 0.2]),
			} as SerializedOrogenWorld["religions"],
		})

		for (const mode of ["heritage", "faith", "religion"] as const) {
			const rgb = computeRegionColors(
				world,
				"population",
				DEFAULT_NATION_MODE,
				mode,
				0,
				0,
				0,
				0,
			)

			expectRegionColor(rgb!, 0, [0.35, 0.33, 0.32])
		}
	})

	it("colors shared dynasties consistently and grays missing dynasties", () => {
		const world = buildWorld({
			elevation: new Float32Array([1, 1]),
			elevation_km: new Float32Array([0.4, 0.8]),
			isLand: new Uint8Array([1, 1]),
			provinces: {
				regionProvince: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				desolate: new Uint8Array([0, 0]),
				landmassId: new Int32Array([0, 0]),
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1]),
				colors: new Float32Array([0.1, 0.2, 0.3, 0.3, 0.2, 0.1]),
			},
			nations: {
				assignment: new Int32Array([1, 0]),
			} as never,
			leaderDynasty: new Int32Array([-1, 7]),
		})

		const rgb = computeRegionColors(
			world,
			"nations",
			"dynasty",
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expect(rgb).not.toBeNull()
		expect(Array.from(rgb!.subarray(0, 3))).not.toEqual([0.35, 0.33, 0.32])
		expect(Array.from(rgb!.subarray(3, 6))).not.toEqual([0.35, 0.33, 0.32])
	})

	it("falls back to defaults for missing danger and basin values", () => {
		const world = buildWorld({
			hazards: {
				danger: new Float32Array([0, 0]),
				earthquake: [undefined, 0.2] as unknown as Float32Array,
				volcano: [undefined, 0.5] as unknown as Float32Array,
			},
			rivers: {
				basinId: [undefined, 2] as unknown as Int32Array,
			} as SerializedOrogenWorld["rivers"],
			cultures: {
				assignment: new Int32Array([0, 0]),
				colors: new Float32Array([0.2, 0.4, 0.6]),
			} as SerializedOrogenWorld["cultures"],
			faiths: {
				assignment: new Int32Array([0]),
				colors: new Float32Array([0.6, 0.5, 0.4]),
			} as SerializedOrogenWorld["faiths"],
			religions: {
				assignment: [undefined] as unknown as Int32Array,
				colors: new Float32Array([0.7, 0.4, 0.2]),
			} as SerializedOrogenWorld["religions"],
			provinces: {
				regionProvince: new Int32Array([0, 0]),
				seeds: new Int32Array([0]),
				count: 1,
				desolate: new Uint8Array([0]),
				landmassId: new Int32Array([0]),
				adjOffset: new Int32Array([0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([2]),
				colors: new Float32Array([0.1, 0.2, 0.3]),
			},
			population: {
				provincePopulation: new Float32Array([1, 1]),
			} as unknown as SerializedOrogenWorld["population"],
		})

		const danger = computeRegionColors(
			world,
			"dangerZones",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)
		const basins = computeRegionColors(
			world,
			"basins",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		const religion = computeRegionColors(
			world,
			"population",
			DEFAULT_NATION_MODE,
			"religion",
			0,
			0,
			0,
			0,
		)

		expectRegionColor(danger!, 0, dangerMapColor(0, 0))
		expectRegionColor(basins!, 0, OCEAN_LIGHT_BLUE)
		expectRegionColor(religion!, 0, [0.35, 0.33, 0.32])
	})

	it("uses lake terrain colors and darkened vegetation elsewhere", () => {
		const world = buildWorld({
			vegetation: new Uint8Array([3, 5]),
			elevation_km: new Float32Array([0.4, 2]),
			rivers: {
				lakes: new Uint8Array([1, 0]),
			} as never,
		})

		const rgb = computeRegionColors(
			world,
			"vegetation",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expect(rgb).not.toBeNull()
		expectRegionColor(rgb!, 0, getColor(0, "terrain"))
		expectRegionColor(rgb!, 1, [
			vegetationColor(5)[0] * 0.85,
			vegetationColor(5)[1] * 0.85,
			vegetationColor(5)[2] * 0.85,
		])
	})

	it("renders pasta and koppen climate palettes", () => {
		const world = buildWorld({
			pastaClimate: new Uint8Array([1, 2]),
			koppenClimate: new Uint8Array([1, 2]),
		})

		const pastaClimate = computeRegionColors(
			world,
			"pastaClimate",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)
		const koppenClimate = computeRegionColors(
			world,
			"koppenClimate",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		expectRegionColor(pastaClimate!, 0, pastaClimateColor(1))
		expectRegionColor(pastaClimate!, 1, [
			pastaClimateColor(2)[0] * 0.74,
			pastaClimateColor(2)[1] * 0.74,
			pastaClimateColor(2)[2] * 0.74,
		])
		expectRegionColor(koppenClimate!, 1, koppenClimateColor(2))
	})

	it("falls back to terrain colors when climate-specific data is missing", () => {
		const world = buildWorld({
			mesh: { numRegions: 3 } as never,
			elevation: new Float32Array([2, -0.5, -1]),
			elevation_km: new Float32Array([2, -0.5, -1]),
			isLand: new Uint8Array([1, 1, 0]),
			provinces: {
				regionProvince: new Int32Array([0, 1, -1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				desolate: new Uint8Array([0, 0]),
				landmassId: new Int32Array([0, 0]),
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1]),
				colors: new Float32Array([0.2, 0.3, 0.4, 0.5, 0.6, 0.7]),
			},
		})
		const terrain = computeRegionColors(
			world,
			"terrain",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expect(terrain).not.toBeNull()
		for (const colorMode of [
			"climate",
			"dtr",
			"oceanCurrents",
			"terrainFeatures",
		] as const) {
			expect(
				computeRegionColors(
					world,
					colorMode,
					DEFAULT_NATION_MODE,
					DEFAULT_POPULATION_MODE,
					0,
					0,
					0,
					0,
				),
			).toEqual(terrain)
		}

		expect(
			computeRegionColors(
				world,
				"nations",
				DEFAULT_NATION_MODE,
				DEFAULT_POPULATION_MODE,
				0,
				0,
				0,
				0,
			),
		).toEqual(terrain)
	})

	it("blends chaotic climate tint only when both extremes exceed the thresholds", () => {
		const world = buildWorld({
			mesh: { numRegions: 3 } as never,
			elevation: new Float32Array([1, 1, -1]),
			elevation_km: new Float32Array([1, 1, -1]),
			isLand: new Uint8Array([1, 1, 0]),
			climate: {
				temperature_avg: new Float32Array([20, 10, 0]),
				temperature_min: new Float32Array([
					CHAOTIC_MIN - 5,
					CHAOTIC_MIN - 5,
					-10,
				]),
				temperature_max: new Float32Array([CHAOTIC_MAX + 5, CHAOTIC_MAX, 10]),
				temperature_monthly: new Float32Array(36),
				temperature_monthly_nolapse: new Float32Array(36),
				temperature_monthly_range: new Float32Array(36),
				insolation_monthly: new Float32Array(36),
				pet_monthly: new Float32Array(36),
				daylight_hours_monthly: new Float32Array(36),
				landFraction: [],
			},
		})

		const rgb = computeRegionColors(
			world,
			"climate",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expect(rgb).not.toBeNull()
		expectRegionColor(
			rgb!,
			0,
			blendRgb(climateTempColor(20), climateZoneColor(8), (5 + 5) / 2 / 15),
		)
		expectRegionColor(rgb!, 1, climateTempColor(10))
		expectRegionColor(rgb!, 2, [0.05, 0.08, 0.18])
	})

	it("blends chaotic climate cells and supports dtr, current, hotspot, and terrain feature modes", () => {
		const coastalBase = getColor(0.5, "terrain")
		const coastalAccent = getColor(2, "terrain")
		const world = buildWorld({
			mesh: { numRegions: 3 } as never,
			elevation: new Float32Array([1, 0.5, -1]),
			elevation_km: new Float32Array([0.5, 2, -1]),
			isLand: new Uint8Array([1, 1, 0]),
			climate: {
				temperature_avg: new Float32Array([25, 10, 0]),
				temperature_min: new Float32Array([-100, -5, -20]),
				temperature_max: new Float32Array([100, 15, 5]),
				temperature_monthly: new Float32Array(36),
				temperature_monthly_nolapse: new Float32Array(36),
				temperature_monthly_range: new Float32Array(36),
				insolation_monthly: new Float32Array(36),
				pet_monthly: new Float32Array(36),
				daylight_hours_monthly: new Float32Array(36),
				landFraction: [],
			},
			dtr_annual: new Float32Array([12, 6, 0]),
			dtr_monthly: new Float32Array([
				4,
				5,
				6,
				14,
				15,
				16,
				...new Array(30).fill(0),
			]),
			oceanCurrents: {
				temperatureDelta: new Float32Array([0, 0, 30]),
				temperatureDeltaMonthly: new Float32Array([
					0,
					0,
					0,
					0,
					0,
					-30,
					...new Array(30).fill(0),
				]),
				oceanWarmth: new Float32Array(3),
				coastalWarmth: new Float32Array(3),
			},
			volcanism: {
				hotspot: new Float32Array([5, 10, 2]),
				mantleUpwelling: new Float32Array(3),
			},
			terrainFeatures: {
				featureMask: new Uint32Array([
					1 << (OROGEN_TERRAIN_FEATURE.RIFT_VALLEY - 1),
					1 << (OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING - 1),
					0,
				]),
				dominantFeature: new Uint8Array([
					OROGEN_TERRAIN_FEATURE.RIFT_VALLEY,
					OROGEN_TERRAIN_FEATURE.RIFT_VALLEY,
					0,
				]),
			},
		})

		const climate = computeRegionColors(
			world,
			"climate",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		const dtr = computeRegionColors(
			world,
			"dtr",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			2,
			0,
		)
		const currents = computeRegionColors(
			world,
			"oceanCurrents",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			2,
			"map",
		)
		const hotspots = computeRegionColors(
			world,
			"hotspots",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)
		const features = computeRegionColors(
			world,
			"terrainFeatures",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expectRegionColor(climate!, 0, climateZoneColor(8))
		expectRegionColor(climate!, 2, [0.05, 0.08, 0.18])
		expectRegionColor(dtr!, 0, dtrColor(14))
		expectRegionColor(dtr!, 2, OCEAN_LIGHT_BLUE)
		expectRegionColor(currents!, 2, [
			oceanCurrentColor(-1)[0] * 0.74,
			oceanCurrentColor(-1)[1] * 0.74,
			oceanCurrentColor(-1)[2] * 0.74,
		])
		expectRegionColor(hotspots!, 1, [
			hotspotColor(1)[0] * 0.85,
			hotspotColor(1)[1] * 0.85,
			hotspotColor(1)[2] * 0.85,
		])
		expectRegionColor(hotspots!, 2, [
			hotspotColor(0.2)[0] * 0.82,
			hotspotColor(0.2)[1] * 0.82,
			hotspotColor(0.2)[2] * 0.82,
		])
		expectRegionColor(features!, 0, [
			coastalBase[0] * 0.2 + 0.82 * 0.8,
			coastalBase[1] * 0.2 + 0.29 * 0.8,
			coastalBase[2] * 0.2 + 0.22 * 0.8,
		])
		expectRegionColor(features!, 1, [
			coastalAccent[0] * 0.2 + 0.98 * 0.8,
			coastalAccent[1] * 0.2 + 0.9 * 0.8,
			coastalAccent[2] * 0.2 + 0.5 * 0.8,
		])
	})

	it("renders slope, topography, monthly precipitation, and temperature delta variants", () => {
		const world = buildWorld({
			topography: new Uint8Array([3, 99]),
			slopeScore: new Float32Array([0.4, 0.4]),
			elevation_km: new Float32Array([2, -1]),
			rainfall: {
				annual: new Float32Array([120, 50]),
				monthly: new Float32Array([50, 10, 300, 80, ...new Array(20).fill(0)]),
				east: new Float32Array([0, 0]),
				west: new Float32Array([0, 0]),
			},
			climate: {
				temperature_avg: new Float32Array([18, 4]),
				temperature_min: new Float32Array([8, -6]),
				temperature_max: new Float32Array([28, 10]),
				temperature_monthly: new Float32Array(24),
				temperature_monthly_nolapse: new Float32Array(24),
				temperature_monthly_range: new Float32Array(24),
				insolation_monthly: new Float32Array(24),
				pet_monthly: new Float32Array(24),
				daylight_hours_monthly: new Float32Array(24),
				landFraction: [],
			},
		})

		const slope = computeRegionColors(
			world,
			"slope",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		const topography = computeRegionColors(
			world,
			"topography",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		const precipitation = computeRegionColors(
			world,
			"precipitation",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			2,
			0,
			0,
		)
		const temperatureDelta = computeRegionColors(
			world,
			"temperatureDelta",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)

		const [slopeR, slopeG, slopeB] = slopeColor(0.4)
		expectRegionColor(slope!, 0, [slopeR, slopeG, slopeB])
		expectRegionColor(slope!, 1, [
			slopeR * 0.45,
			slopeG * 0.55,
			Math.min(1, slopeB * 0.8 + 0.18),
		])

		expectRegionColor(topography!, 0, getTopographyColor(3)!)
		expectRegionColor(topography!, 1, [1, 1, 1])

		expectRegionColor(
			precipitation!,
			0,
			darkenClimateAtElevation(precipitationColor(300), 2),
		)
		expectRegionColor(precipitation!, 1, OCEAN_LIGHT_BLUE)

		expectRegionColor(temperatureDelta!, 0, temperatureDeltaColor(20))
		expectRegionColor(temperatureDelta!, 1, temperatureDeltaColor(16))
	})

	it("renders nation overlays for province, border, and population variants", () => {
		const provinceWorld = buildWorld({
			mesh: { numRegions: 3 } as never,
			elevation: new Float32Array([-1, 0.5, 2]),
			elevation_km: new Float32Array([-1, 0.5, 2]),
			isLand: new Uint8Array([0, 1, 1]),
			provinces: {
				regionProvince: new Int32Array([-1, 0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				desolate: new Uint8Array([1, 0]),
				landmassId: new Int32Array([0, 0]),
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1]),
				colors: new Float32Array([0.2, 0.3, 0.4, 0.8, 0.5, 0.2]),
			},
		})
		const provinces = computeRegionColors(
			provinceWorld,
			"nations",
			"provinces",
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		expectRegionColor(provinces!, 0, OCEAN_LIGHT_BLUE)
		expectRegionColor(provinces!, 1, [0.35, 0.33, 0.32])
		expectRegionColor(
			provinces!,
			2,
			darkenPoliticalAtElevation([0.8, 0.5, 0.2], 2),
		)

		const nationWorld = buildWorld({
			mesh: { numRegions: 3 } as never,
			elevation: new Float32Array([-1, 0.8, 1.5]),
			elevation_km: new Float32Array([-1, 0.8, 1.5]),
			isLand: new Uint8Array([0, 1, 1]),
			provinces: {
				regionProvince: new Int32Array([-1, 1, 2]),
				seeds: new Int32Array([0, 1, 2]),
				count: 3,
				desolate: new Uint8Array([0, 0, 0]),
				landmassId: new Int32Array([0, 0, 0]),
				adjOffset: new Int32Array([0, 0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1, 1]),
				colors: new Float32Array([0.1, 0.1, 0.1, 0.2, 0.2, 0.2, 0.3, 0.3, 0.3]),
			},
			nations: {
				assignment: new Int32Array([0, 1, -1]),
				seeds: new Int32Array([0, 1, 2]),
				count: 3,
				adjOffset: new Int32Array([0, 0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1, 1]),
				colors: new Float32Array([0.1, 0.2, 0.3, 0.6, 0.4, 0.2, 0.8, 0.7, 0.1]),
				parent: new Int32Array([-1, -1, -1]),
				depth: new Int32Array([0, 0, 0]),
				childOffset: new Int32Array([0, 0, 0, 0]),
				childList: new Int32Array(0),
				sovereign: new Int32Array([0, 1, 2]),
				gravity: new Float32Array([1, 1, 1]),
			},
		})
		const borders = computeRegionColors(
			nationWorld,
			"nations",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		expectRegionColor(borders!, 0, OCEAN_LIGHT_BLUE)
		expectRegionColor(
			borders!,
			1,
			darkenPoliticalAtElevation([0.6, 0.4, 0.2], 0.8),
		)
		expectRegionColor(borders!, 2, [0.35, 0.33, 0.32])

		const populationWorld = buildWorld({
			mesh: { numRegions: 2 } as never,
			elevation: new Float32Array([1, 0.5]),
			elevation_km: new Float32Array([1, 0.5]),
			isLand: new Uint8Array([1, 1]),
			provinces: {
				regionProvince: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				desolate: new Uint8Array([0, 0]),
				landmassId: new Int32Array([0, 0]),
				adjOffset: new Int32Array([0, 1, 2]),
				adjList: new Int32Array([1, 0]),
				size: new Int32Array([2, 5]),
				colors: new Float32Array([0.3, 0.4, 0.5, 0.7, 0.8, 0.9]),
			},
			population: {
				habitability: new Float32Array([0.8, 0.4]),
				population: new Float32Array([20, 10]),
				habitabilityScore: 1.2,
				totalPopulation: 30,
			},
			nations: {
				assignment: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				adjOffset: new Int32Array([0, 1, 2]),
				adjList: new Int32Array([1, 0]),
				size: new Int32Array([1, 1]),
				colors: new Float32Array([0.2, 0.2, 0.2, 0.8, 0.8, 0.8]),
				parent: new Int32Array([-1, -1]),
				depth: new Int32Array([0, 0]),
				childOffset: new Int32Array([0, 0, 0]),
				childList: new Int32Array(0),
				sovereign: new Int32Array([0, 1]),
				gravity: new Float32Array([5, 10]),
			},
			development: new Float32Array([3, 6]),
			cultures: {
				assignment: new Int32Array([-1, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				adjOffset: new Int32Array([0, 1, 2]),
				adjList: new Int32Array([1, 0]),
				size: new Int32Array([1, 1]),
				colors: new Float32Array([0.1, 0.1, 0.1, 0.4, 0.5, 0.6]),
			},
			heritages: {
				assignment: new Int32Array([0, 0]),
				seeds: new Int32Array([0]),
				count: 1,
				adjOffset: new Int32Array([0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([2]),
				colors: new Float32Array([0.6, 0.3, 0.2]),
			},
			faiths: {
				assignment: new Int32Array([0, 0]),
				seeds: new Int32Array([0]),
				count: 1,
				adjOffset: new Int32Array([0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([2]),
				colors: new Float32Array([0.2, 0.6, 0.3]),
			},
			religions: {
				assignment: new Int32Array([0]),
				seeds: new Int32Array([0]),
				count: 1,
				adjOffset: new Int32Array([0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1]),
				colors: new Float32Array([0.7, 0.2, 0.5]),
			},
		})

		const density = computeRegionColors(
			populationWorld,
			"population",
			DEFAULT_NATION_MODE,
			"density",
			0,
			0,
			0,
			0,
		)
		const development = computeRegionColors(
			populationWorld,
			"population",
			DEFAULT_NATION_MODE,
			"development",
			0,
			0,
			0,
			0,
		)
		const culture = computeRegionColors(
			populationWorld,
			"population",
			DEFAULT_NATION_MODE,
			"culture",
			0,
			0,
			0,
			0,
		)
		const heritage = computeRegionColors(
			populationWorld,
			"population",
			DEFAULT_NATION_MODE,
			"heritage",
			0,
			0,
			0,
			0,
		)
		const faith = computeRegionColors(
			populationWorld,
			"population",
			DEFAULT_NATION_MODE,
			"faith",
			0,
			0,
			0,
			0,
		)
		const religion = computeRegionColors(
			populationWorld,
			"population",
			DEFAULT_NATION_MODE,
			"religion",
			0,
			0,
			0,
			0,
		)

		expectRegionColor(density!, 0, populationColor(1))
		expectRegionColor(density!, 1, populationColor(0.2))
		expectRegionColor(development!, 0, developmentColor(0.5))
		expectRegionColor(development!, 1, developmentColor(1))
		expectRegionColor(culture!, 0, [0.35, 0.33, 0.32])
		expectRegionColor(culture!, 1, [0.4, 0.5, 0.6])
		expectRegionColor(heritage!, 0, [0.35, 0.33, 0.32])
		expectRegionColor(heritage!, 1, [0.6, 0.3, 0.2])
		expectRegionColor(faith!, 0, [0.35, 0.33, 0.32])
		expectRegionColor(faith!, 1, [0.2, 0.6, 0.3])
		expectRegionColor(religion!, 0, [0.35, 0.33, 0.32])
		expectRegionColor(religion!, 1, [0.7, 0.2, 0.5])
	})

	it("covers province, population, basin, and null fallbacks", () => {
		const provinceWorld = buildWorld({
			mesh: { numRegions: 3 } as never,
			elevation: new Float32Array([1, 0.4, -1]),
			elevation_km: new Float32Array([1, 0.4, -1]),
			isLand: new Uint8Array([1, 1, 0]),
			provinces: {
				count: 2,
				regionProvince: new Int32Array([0, 1, -1]),
				colors: new Float32Array([0.9, 0.2, 0.1, 0.3, 0.6, 0.2]),
				desolate: new Uint8Array([0, 1]),
				size: new Int32Array([10, 1]),
			} as never,
			population: {
				population: new Float32Array([50, 0]),
				habitability: new Float32Array([1, 1]),
				habitabilityScore: 1,
				totalPopulation: 50,
			} as never,
			rivers: {
				basinId: new Int32Array([7, -1, 11]),
			} as never,
		})

		const provinces = computeRegionColors(
			provinceWorld,
			"provinces",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		const population = computeRegionColors(
			provinceWorld,
			"population",
			DEFAULT_NATION_MODE,
			"culture",
			0,
			0,
			0,
			0,
		)
		const basins = computeRegionColors(
			provinceWorld,
			"basins",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		const empty = computeRegionColors(
			{
				mesh: { numRegions: 1 },
				elevation: new Float32Array([0]),
				elevation_km: new Float32Array([0]),
			} as never,
			"terrain",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expectRegionColor(
			provinces!,
			0,
			darkenPoliticalAtElevation(
				[0.9, 0.2, 0.1],
				provinceWorld.elevation_km[0],
			),
		)
		expectRegionColor(provinces!, 1, [0.35, 0.33, 0.32])
		expectRegionColor(provinces!, 2, OCEAN_LIGHT_BLUE)
		expectRegionColor(population!, 0, [0.35, 0.33, 0.32])
		expectRegionColor(population!, 1, [0.35, 0.33, 0.32])
		expectRegionColor(population!, 2, OCEAN_LIGHT_BLUE)
		expectRegionColor(basins!, 1, OCEAN_LIGHT_BLUE)
		expect(basins!.subarray(0, 3)).not.toEqual(basins!.subarray(6, 9))
		expect(empty).toBeNull()
		expect(
			computeRegionColors(
				{
					mesh: { numRegions: 1 },
					elevation: new Float32Array([0]),
					elevation_km: new Float32Array([0]),
				} as never,
				"unsupported-mode" as never,
				DEFAULT_NATION_MODE,
				DEFAULT_POPULATION_MODE,
				0,
				0,
				0,
				0,
			),
		).toBeNull()
	})

	it("falls back to the first terrain feature when the dominant feature is invalid", () => {
		const landBase = getColor(0.5, "terrain")
		const oceanBase = getColor(-0.5, "terrain")
		const world = buildWorld({
			elevation: new Float32Array([0.5, -0.5]),
			elevation_km: new Float32Array([0.5, -0.5]),
			isLand: new Uint8Array([1, 0]),
			terrainFeatures: {
				featureMask: new Uint32Array([
					(1 << (OROGEN_TERRAIN_FEATURE.FOLD_RIDGES - 1)) |
						(1 << (OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING - 1)),
					(1 << (OROGEN_TERRAIN_FEATURE.TRENCH - 1)) |
						(1 << (OROGEN_TERRAIN_FEATURE.RIFT_VALLEY - 1)),
				]),
				dominantFeature: new Uint8Array([
					OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING,
					OROGEN_TERRAIN_FEATURE.RIFT_VALLEY,
				]),
			},
		})

		const features = computeRegionColors(
			world,
			"terrainFeatures",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expectRegionColor(features!, 0, [
			landBase[0] * 0.2 + 0.98 * 0.8,
			landBase[1] * 0.2 + 0.9 * 0.8,
			landBase[2] * 0.2 + 0.5 * 0.8,
		])
		expectRegionColor(features!, 1, [
			oceanBase[0] * 0.2 + 0.82 * 0.8,
			oceanBase[1] * 0.2 + 0.29 * 0.8,
			oceanBase[2] * 0.2 + 0.22 * 0.8,
		])
	})

	it("covers terrain mode for lakes, submerged land shelves, open ocean, and dry land", () => {
		const seaR = 0xac / 255
		const seaG = 0xd0 / 255
		const seaB = 0xa5 / 255
		const depR = 0xa7 / 255
		const depG = 0xdf / 255
		const depB = 0xd2 / 255
		const shelfT = Math.sqrt(0.25)
		const world = buildWorld({
			mesh: { numRegions: 4 } as never,
			elevation: new Float32Array([-0.25, -1, -2, 2]),
			elevation_km: new Float32Array([-0.25, -1, -2, 2]),
			isLand: new Uint8Array([1, 1, 0, 1]),
			rivers: {
				lakes: new Uint8Array([0, 1, 0, 0]),
			} as never,
		})

		const terrain = computeRegionColors(
			world,
			"terrain",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expectRegionColor(terrain!, 0, [
			seaR + (depR - seaR) * shelfT,
			seaG + (depG - seaG) * shelfT,
			seaB + (depB - seaB) * shelfT,
		])
		expectRegionColor(terrain!, 1, getColor(-1, "terrain"))
		expectRegionColor(terrain!, 2, getColor(-2, "terrain"))
		expectRegionColor(terrain!, 3, getColor(2, "terrain"))
	})

	it("uses neutral fills for desolate provinces in both province and nation overlays", () => {
		const world = buildWorld({
			mesh: { numRegions: 2 } as never,
			elevation: new Float32Array([1, 2]),
			elevation_km: new Float32Array([1, 2]),
			isLand: new Uint8Array([1, 1]),
			provinces: {
				regionProvince: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				desolate: new Uint8Array([1, 0]),
				landmassId: new Int32Array([0, 0]),
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1]),
				colors: new Float32Array([0.4, 0.1, 0.1, 0.7, 0.5, 0.3]),
			},
			nations: {
				assignment: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				count: 2,
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1]),
				colors: new Float32Array([0.2, 0.2, 0.2, 0.9, 0.7, 0.5]),
				parent: new Int32Array([-1, -1]),
				depth: new Int32Array([0, 0]),
				childOffset: new Int32Array([0, 0, 0]),
				childList: new Int32Array(0),
				sovereign: new Int32Array([0, 1]),
				gravity: new Float32Array([1, 1]),
			},
		})

		const provinces = computeRegionColors(
			world,
			"provinces",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)
		const nations = computeRegionColors(
			world,
			"nations",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expect(provinces).not.toBeNull()
		expect(nations).not.toBeNull()
		expectRegionColor(provinces!, 0, [0.35, 0.33, 0.32])
		expectRegionColor(
			provinces!,
			1,
			darkenPoliticalAtElevation([0.7, 0.5, 0.3], 2),
		)
		expectRegionColor(nations!, 0, [0.35, 0.33, 0.32])
		expectRegionColor(
			nations!,
			1,
			darkenPoliticalAtElevation([0.9, 0.7, 0.5], 2),
		)
	})

	it("renders terrain features and falls back to terrain colors for default rendering", () => {
		const featureWorld = buildWorld({
			mesh: { numRegions: 4 } as never,
			elevation: new Float32Array([1, 0.4, -1, 0.2]),
			elevation_km: new Float32Array([1, 0.4, -1, 0.2]),
			isLand: new Uint8Array([1, 1, 0, 1]),
			terrainFeatures: {
				featureMask: new Uint32Array([
					1 << (OROGEN_TERRAIN_FEATURE.RIFT_VALLEY - 1),
					1 << (OROGEN_TERRAIN_FEATURE.MID_OCEAN_RIDGE - 1),
					1 << (OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING - 1),
					(1 << (OROGEN_TERRAIN_FEATURE.RIFT_VALLEY - 1)) |
						(1 << (OROGEN_TERRAIN_FEATURE.FOLD_RIDGES - 1)),
				]),
				dominantFeature: new Uint8Array([
					OROGEN_TERRAIN_FEATURE.RIFT_VALLEY,
					OROGEN_TERRAIN_FEATURE.MID_OCEAN_RIDGE,
					OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING,
					OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING,
				]),
			},
		})
		const features = computeRegionColors(
			featureWorld,
			"terrainFeatures",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		const region0Base = getColor(1, "terrain")
		const region1Base = getColor(0.4, "terrain")
		const region2Base = getColor(-1, "terrain")
		const region3Base = getColor(0.2, "terrain")

		expectRegionColor(features!, 0, [
			region0Base[0] * 0.2 + 0.82 * 0.8,
			region0Base[1] * 0.2 + 0.29 * 0.8,
			region0Base[2] * 0.2 + 0.22 * 0.8,
		])
		expectRegionColor(features!, 1, [
			region1Base[0] * 0.2 + 0.17 * 0.8,
			region1Base[1] * 0.2 + 0.73 * 0.8,
			region1Base[2] * 0.2 + 0.88 * 0.8,
		])
		expectRegionColor(features!, 2, [
			region2Base[0] * 0.2 + 0.98 * 0.8,
			region2Base[1] * 0.2 + 0.9 * 0.8,
			region2Base[2] * 0.2 + 0.5 * 0.8,
		])
		expectRegionColor(features!, 3, [
			region3Base[0] * 0.2 + 0.82 * 0.8,
			region3Base[1] * 0.2 + 0.29 * 0.8,
			region3Base[2] * 0.2 + 0.22 * 0.8,
		])

		const terrainWorld = buildWorld({
			mesh: { numRegions: 4 } as never,
			elevation: new Float32Array([1, -0.4, -1, 0.5]),
			elevation_km: new Float32Array([1, -0.4, -1, 0.5]),
			isLand: new Uint8Array([1, 1, 0, 1]),
			rivers: {
				lakes: new Uint8Array([0, 0, 0, 1]),
			} as never,
		})
		const terrain = computeRegionColors(
			terrainWorld,
			"terrain",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expectRegionColor(terrain!, 0, getColor(1, "terrain"))
		expectRegionColor(terrain!, 1, [
			0xac / 255 + (0xa7 / 255 - 0xac / 255) * Math.sqrt(0.4),
			0xd0 / 255 + (0xdf / 255 - 0xd0 / 255) * Math.sqrt(0.4),
			0xa5 / 255 + (0xd2 / 255 - 0xa5 / 255) * Math.sqrt(0.4),
		])
		expectRegionColor(terrain!, 2, getColor(-1, "terrain"))
		expectRegionColor(terrain!, 3, getColor(0, "terrain"))
	})

	it("covers hotspot normalization fallback, current fallbacks, and unknown terrain accents", () => {
		const region0Base = getColor(1, "terrain")
		const region1Base = getColor(-1, "terrain")
		const region2Base = getColor(0.2, "terrain")
		const world = buildWorld({
			mesh: { numRegions: 3 } as never,
			elevation: new Float32Array([1, -1, 0.2]),
			elevation_km: new Float32Array([1, -1, 0.2]),
			isLand: new Uint8Array([1, 0, 1]),
			oceanCurrents: {
				temperatureDelta: new Float32Array([6, -12, 0]),
				temperatureDeltaMonthly: new Float32Array([1, 2]),
				oceanWarmth: new Float32Array(3),
				coastalWarmth: new Float32Array(3),
			},
			volcanism: {
				hotspot: new Float32Array([0, 0, 0]),
				mantleUpwelling: new Float32Array(3),
			},
			terrainFeatures: {
				featureMask: new Uint32Array([
					1 << (OROGEN_TERRAIN_FEATURE.FOLD_RIDGES - 1),
					1 << 11,
					0,
				]),
				dominantFeature: new Uint8Array([
					OROGEN_TERRAIN_FEATURE.FOLD_RIDGES,
					12,
					0,
				]),
			},
		})

		const currents = computeRegionColors(
			world,
			"oceanCurrents",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			2,
			"map",
		)
		const hotspots = computeRegionColors(
			world,
			"hotspots",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
			"map",
		)
		const features = computeRegionColors(
			world,
			"terrainFeatures",
			DEFAULT_NATION_MODE,
			DEFAULT_POPULATION_MODE,
			0,
			0,
			0,
			0,
		)

		expectRegionColor(currents!, 0, oceanCurrentColor(6 / 15))
		expectRegionColor(currents!, 1, [
			oceanCurrentColor(-12 / 15)[0] * 0.74,
			oceanCurrentColor(-12 / 15)[1] * 0.74,
			oceanCurrentColor(-12 / 15)[2] * 0.74,
		])
		expectRegionColor(
			hotspots!,
			0,
			darkenVegetationAtElevation(hotspotColor(0), 1),
		)
		expectRegionColor(hotspots!, 1, [
			hotspotColor(0)[0] * 0.82,
			hotspotColor(0)[1] * 0.82,
			hotspotColor(0)[2] * 0.82,
		])
		expectRegionColor(features!, 0, [
			region0Base[0] * 0.2 + 0.55 * 0.8,
			region0Base[1] * 0.2 + 0.24 * 0.8,
			region0Base[2] * 0.2 + 0.13 * 0.8,
		])
		expectRegionColor(features!, 1, [
			region1Base[0] * 0.2 + 0.8,
			region1Base[1] * 0.2 + 0.8,
			region1Base[2] * 0.2 + 0.8,
		])
		expectRegionColor(features!, 2, [
			region2Base[0] * 0.32,
			region2Base[1] * 0.32,
			region2Base[2] * 0.32,
		])
	})

	it("keeps broad mode sweeps finite across mixed region data", () => {
		const world = buildWorld({
			mesh: { numRegions: 6 } as never,
			elevation: new Float32Array([2, 0.6, -0.1, -1, 1.5, 0]),
			elevation_km: new Float32Array([2, 0.6, -0.1, -1, 1.5, 0]),
			isLand: new Uint8Array([1, 1, 1, 0, 1, 0]),
			slopeScore: new Float32Array([0, 0.2, 0.5, 0.8, 1, 0.3]),
			topography: new Uint8Array([0, 1, 2, 5, 6, 99]),
			climate: {
				temperature_avg: new Float32Array([24, 8, 2, -3, 36, 18]),
				temperature_min: new Float32Array([12, -8, -20, -5, 18, 4]),
				temperature_max: new Float32Array([34, 16, 28, 3, 55, 26]),
				temperature_monthly: new Float32Array(72).fill(10),
				temperature_monthly_nolapse: new Float32Array(72).fill(10),
				temperature_monthly_range: new Float32Array(72),
				insolation_monthly: new Float32Array(72).fill(220),
				pet_monthly: new Float32Array(72).fill(80),
				daylight_hours_monthly: new Float32Array(72).fill(12),
				landFraction: [],
			},
			rainfall: {
				annual: new Float32Array([800, 300, 120, 40, 600, 100]),
				monthly: new Float32Array(72).fill(50),
				east: new Float32Array([0.4, 0.33, 0.7, 0.1, 0.5, 0.2]),
				west: new Float32Array([0.39, 0.35, 0.2, 0.4, 0.48, 0.3]),
			},
			vegetation: new Uint8Array([1, 2, 3, 4, 5, 6]),
			rivers: {
				lakes: new Uint8Array([0, 0, 1, 0, 0, 0]),
				basinId: new Int32Array([0, 1, 2, 3, 4, 5]),
			} as never,
			pastaClimate: new Uint8Array([1, 2, 3, 4, 5, 6]),
			koppenClimate: new Uint8Array([1, 2, 3, 4, 5, 6]),
			pastaDebug: {
				gdd: new Float32Array([10, 20, 30, 40, 50, 60]),
				gint: new Float32Array([100, 500, 99999, 900, 1200, 1400]),
				gdd_monthly: new Float32Array(72),
				gint_monthly: new Float32Array(72),
				minT: new Float32Array([-10, -5, 0, 5, 10, 15]),
				maxT: new Float32Array([10, 20, 30, 40, 50, 60]),
			},
			dtr_annual: new Float32Array([6, 8, 10, 12, 14, 16]),
			dtr_monthly: new Float32Array(72).fill(9),
			oceanCurrents: {
				temperatureDelta: new Float32Array([4, -6, 2, -8, 10, 0]),
				temperatureDeltaMonthly: new Float32Array(72).fill(3),
				oceanWarmth: new Float32Array(6),
				coastalWarmth: new Float32Array(6),
			},
			hazards: {
				danger: new Float32Array(6),
				earthquake: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]),
				volcano: new Float32Array([0.9, 0.7, 0.5, 0.3, 0.1, 0]),
			},
			volcanism: {
				hotspot: new Float32Array([0, 0.5, 1, 2, 4, 8]),
				mantleUpwelling: new Float32Array(6),
			},
			provinces: {
				regionProvince: new Int32Array([0, 1, 2, -1, 3, 4]),
				seeds: new Int32Array([0, 1, 2, 4, 5]),
				count: 5,
				desolate: new Uint8Array([0, 1, 0, 0, 0]),
				landmassId: new Int32Array([0, 0, 1, 1, 2]),
				adjOffset: new Int32Array([0, 0, 0, 0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([10, 1, 5, 8, 4]),
				colors: new Float32Array([
					0.8, 0.2, 0.1, 0.2, 0.4, 0.6, 0.6, 0.3, 0.2, 0.3, 0.7, 0.4, 0.9, 0.8,
					0.2,
				]),
			},
			nations: {
				assignment: new Int32Array([0, -1, 1, 2, 3]),
				seeds: new Int32Array([0, 2, 3, 4]),
				count: 4,
				adjOffset: new Int32Array([0, 0, 0, 0, 0]),
				adjList: new Int32Array(0),
				size: new Int32Array([1, 1, 1, 1]),
				colors: new Float32Array([
					0.7, 0.5, 0.3, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 0.9, 0.7, 0.5, 0.2, 0.5,
					0.8,
				]),
				parent: new Int32Array([-1, -1, -1, -1]),
				depth: new Int32Array([0, 0, 0, 0]),
				childOffset: new Int32Array([0, 0, 0, 0, 0]),
				childList: new Int32Array(0),
				sovereign: new Int32Array([0, 1, 2, 3]),
				gravity: new Float32Array([1, 3, 2, 4, 5]),
			},
			population: {
				population: new Float32Array([50, 0, 20, 0, 80]),
				habitability: new Float32Array([1, 1, 1, 1, 1]),
				habitabilityScore: 1,
				totalPopulation: 150,
			},
			development: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]),
			cultures: {
				assignment: new Int32Array([0, -1, 1, 2, 3]),
				colors: new Float32Array([
					0.2, 0.3, 0.4, 0.4, 0.5, 0.6, 0.6, 0.2, 0.4, 0.8, 0.1, 0.2,
				]),
			} as never,
			heritages: {
				assignment: new Int32Array([0, 1, 1, 0]),
				colors: new Float32Array([0.7, 0.2, 0.3, 0.1, 0.6, 0.4]),
			} as never,
			faiths: {
				assignment: new Int32Array([0, 1, 2, 1]),
				colors: new Float32Array([0.3, 0.6, 0.2, 0.5, 0.4, 0.1, 0.7, 0.2, 0.5]),
			} as never,
			religions: {
				assignment: new Int32Array([0, 1, 2]),
				colors: new Float32Array([0.9, 0.2, 0.5, 0.2, 0.7, 0.5, 0.4, 0.4, 0.8]),
			} as never,
			terrainFeatures: {
				featureMask: new Uint32Array([
					1 << (OROGEN_TERRAIN_FEATURE.RIFT_VALLEY - 1),
					1 << (OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING - 1),
					1 << (OROGEN_TERRAIN_FEATURE.MID_OCEAN_RIDGE - 1),
					1 << (OROGEN_TERRAIN_FEATURE.TRENCH - 1),
					1 << (OROGEN_TERRAIN_FEATURE.FOLD_RIDGES - 1),
					1 << 11,
				]),
				dominantFeature: new Uint8Array([
					OROGEN_TERRAIN_FEATURE.RIFT_VALLEY,
					OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING,
					OROGEN_TERRAIN_FEATURE.MID_OCEAN_RIDGE,
					OROGEN_TERRAIN_FEATURE.TRENCH,
					OROGEN_TERRAIN_FEATURE.FOLD_RIDGES,
					12,
				]),
			},
		})
		const modes: Array<
			[Parameters<typeof computeRegionColors>[1], PopulationMapMode]
		> = [
			["slope", DEFAULT_POPULATION_MODE],
			["topography", DEFAULT_POPULATION_MODE],
			["temperature", DEFAULT_POPULATION_MODE],
			["temperatureDelta", DEFAULT_POPULATION_MODE],
			["precipitation", DEFAULT_POPULATION_MODE],
			["moisture", DEFAULT_POPULATION_MODE],
			["vegetation", DEFAULT_POPULATION_MODE],
			["pastaClimate", DEFAULT_POPULATION_MODE],
			["koppenClimate", DEFAULT_POPULATION_MODE],
			["climate", DEFAULT_POPULATION_MODE],
			["dtr", DEFAULT_POPULATION_MODE],
			["oceanCurrents", DEFAULT_POPULATION_MODE],
			["dangerZones", DEFAULT_POPULATION_MODE],
			["hotspots", DEFAULT_POPULATION_MODE],
			["nations", DEFAULT_POPULATION_MODE],
			["provinces", DEFAULT_POPULATION_MODE],
			["population", "density"],
			["population", "development"],
			["population", "culture"],
			["population", "heritage"],
			["population", "faith"],
			["population", "religion"],
			["basins", DEFAULT_POPULATION_MODE],
			["terrainFeatures", DEFAULT_POPULATION_MODE],
			["terrain", DEFAULT_POPULATION_MODE],
		]

		for (const [mode, populationMode] of modes) {
			const rgb = computeRegionColors(
				world,
				mode,
				DEFAULT_NATION_MODE,
				populationMode,
				1,
				1,
				1,
				1,
				mode === "temperature" ||
					mode === "moisture" ||
					mode === "oceanCurrents"
					? "map"
					: "globe",
			)
			expect(rgb).not.toBeNull()
			expect(rgb).toHaveLength(18)
			expect(Array.from(rgb!).every(Number.isFinite)).toBe(true)
		}
	})
})
