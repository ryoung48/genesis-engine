import { describe, expect, it } from "vitest"
import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisParams,
	GenesisRainfall,
	SphereMesh,
} from ".."
import {
	assignPastaClimate,
	pastaClimateColor,
	pastaClimateName,
} from "./pasta"

function buildMesh(): SphereMesh {
	return {
		numRegions: 1,
		r_xyz: new Float32Array([1, 0, 0]),
		adjList: new Int32Array(0),
		adjOffset: new Int32Array([0, 0]),
	} as SphereMesh
}

function buildParams(overrides: Partial<GenesisParams> = {}): GenesisParams {
	return {
		seed: 1,
		numPoints: 1,
		numPlates: 1,
		landDistribution: 0.5,
		continentSizeVariety: 0.5,
		landCoverage: 0.5,
		jitter: 0,
		roughness: 0,
		terrainWarp: 0,
		smoothing: 0,
		hydraulicErosion: 0,
		thermalErosion: 0,
		ridgeSharpening: 0,
		glacialErosion: 0,
		seaLevel: 1,
		planetRadiusKm: 6371,
		obliquity: 23.5,
		eccentricity: 0.0167,
		sunTempFactor: 1,
		insolationFactor: 1,
		daysPerYear: 360,
		hoursPerDay: 24,
		tidallyLocked: false,
		antistellarLon: 180,
		perihelion: 102,
		...overrides,
	}
}

interface PastaCaseInput {
	temperatures: number[]
	insolation: number[]
	rainfall?: number[]
	pet?: number[]
	aet?: number[]
}

function toMonthly(values: number[]): Float32Array {
	return new Float32Array(values)
}

function buildClimate(input: PastaCaseInput): GenesisClimate {
	const temperatures = input.temperatures
	return {
		temperature_avg: new Float32Array([
			temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length,
		]),
		temperature_min: new Float32Array([Math.min(...temperatures)]),
		temperature_max: new Float32Array([Math.max(...temperatures)]),
		temperature_monthly: toMonthly(temperatures),
		temperature_monthly_nolapse: toMonthly(temperatures),
		temperature_monthly_range: new Float32Array(12),
		insolation_monthly: toMonthly(input.insolation),
		pet_monthly: toMonthly(input.pet ?? new Array(12).fill(0)),
		daylight_hours_monthly: new Float32Array(12).fill(12),
		landFraction: new Array(36).fill(0),
	}
}

function buildRainfall(
	monthly: number[] = new Array(12).fill(0),
): GenesisRainfall {
	return {
		monthly: toMonthly(monthly),
		annual: new Float32Array([monthly.reduce((sum, value) => sum + value, 0)]),
		east: new Float32Array([0]),
		west: new Float32Array([0]),
	}
}

function buildHydrology(
	aet: number[] = new Array(12).fill(0),
): GenesisHydrology {
	return {
		aet_monthly: toMonthly(aet),
		aridity_monthly: new Float32Array(12),
		baseflow_monthly: new Float32Array(12),
	}
}

function classifyCase(
	isLand: boolean,
	input: PastaCaseInput,
	options: {
		iceThickness?: number
		iceMinMonthly?: number
		iceMaxMonthly?: number
	} = {},
) {
	return assignPastaClimate(
		buildMesh(),
		new Uint8Array([isLand ? 1 : 0]),
		buildClimate(input),
		buildRainfall(input.rainfall),
		buildHydrology(input.aet),
		buildParams(),
		options.iceThickness === undefined
			? undefined
			: new Float32Array([options.iceThickness]),
		options.iceMinMonthly === undefined
			? undefined
			: new Float32Array([options.iceMinMonthly]),
		options.iceMaxMonthly === undefined
			? undefined
			: new Float32Array([options.iceMaxMonthly]),
	)
}

function monthly(value: number): number[] {
	return new Array(12).fill(value)
}

function findClassifiedCase(
	expectedName: string,
	isLand: boolean,
	inputs: PastaCaseInput[],
	options: {
		iceThickness?: number
		iceMinMonthly?: number
		iceMaxMonthly?: number
	} = {},
) {
	for (const input of inputs) {
		const result = classifyCase(isLand, input, options)
		if (pastaClimateName(result.zones[0]) === expectedName) return result
	}
	throw new Error(`No case found for ${expectedName}`)
}

function classifySearchGrid(
	isLand: boolean,
	search: {
		temperatureProfiles: number[][]
		insolations: number[]
		rainfalls?: number[]
		pets?: number[]
		aets?: number[]
		options?: {
			iceThickness?: number
			iceMinMonthly?: number
			iceMaxMonthly?: number
		}
	},
): Map<string, ReturnType<typeof classifyCase>> {
	const names = new Map<string, ReturnType<typeof classifyCase>>()
	const rainfalls = search.rainfalls ?? [0]
	const pets = search.pets ?? [0]
	const aets = search.aets ?? [0]
	for (const temperatures of search.temperatureProfiles) {
		for (const insolation of search.insolations) {
			for (const rainfall of rainfalls) {
				for (const pet of pets) {
					for (const aet of aets) {
						const result = classifyCase(
							isLand,
							{
								temperatures,
								insolation: monthly(insolation),
								rainfall: monthly(rainfall),
								pet: monthly(pet),
								aet: monthly(aet),
							},
							search.options,
						)
						const name = pastaClimateName(result.zones[0])
						if (!names.has(name)) names.set(name, result)
					}
				}
			}
		}
	}
	return names
}

describe("assignPastaClimate", () => {
	it("classifies permanent frozen oceans from persistent ice cover", () => {
		const result = classifyCase(
			false,
			{
				temperatures: new Array(12).fill(-20),
				insolation: new Array(12).fill(0),
			},
			{ iceMinMonthly: 81 },
		)

		expect(pastaClimateName(result.zones[0])).toBe("Permanent Frozen Ocean")
		expect(result.debug.minT[0]).toBe(-20)
		expect(result.debug.maxT[0]).toBe(-20)
		expect(result.debug.gdd[0]).toBe(0)
	})

	it("classifies barren seasonal frozen oceans when ice is seasonal and heat stays minimal", () => {
		const result = classifyCase(
			false,
			{
				temperatures: new Array(12).fill(-15),
				insolation: new Array(12).fill(0),
			},
			{ iceMaxMonthly: 25 },
		)

		expect(pastaClimateName(result.zones[0])).toBe(
			"Barren Seasonal Frozen Ocean",
		)
	})

	it("classifies land ice sheets when thick ice survives year-round", () => {
		const result = classifyCase(
			true,
			{
				temperatures: new Array(12).fill(-5),
				insolation: new Array(12).fill(50),
				rainfall: new Array(12).fill(10),
				pet: new Array(12).fill(5),
				aet: new Array(12).fill(5),
			},
			{ iceThickness: 101 },
		)

		expect(pastaClimateName(result.zones[0])).toBe("Ice")
	})

	it("classifies cold barren land when growing degree days never accumulate", () => {
		const result = classifyCase(true, {
			temperatures: new Array(12).fill(-15),
			insolation: new Array(12).fill(0),
			rainfall: new Array(12).fill(0),
			pet: new Array(12).fill(0),
			aet: new Array(12).fill(0),
		})

		expect(pastaClimateName(result.zones[0])).toBe("Cold Barren")
	})

	it("classifies warm deserts when moisture availability is extremely low", () => {
		const result = classifyCase(true, {
			temperatures: new Array(12).fill(45),
			insolation: new Array(12).fill(400),
			rainfall: new Array(12).fill(0),
			pet: new Array(12).fill(300),
			aet: new Array(12).fill(0),
		})

		expect(pastaClimateName(result.zones[0])).toBe("Warm Desert")
	})

	it("classifies oceanic boreal climates from cool wet growing seasons", () => {
		const result = classifyCase(true, {
			temperatures: new Array(12).fill(8),
			insolation: new Array(12).fill(200),
			rainfall: new Array(12).fill(50),
			pet: new Array(12).fill(40),
			aet: new Array(12).fill(35),
		})

		expect(pastaClimateName(result.zones[0])).toBe("Oceanic Temperate")
		expect(result.debug.gdd[0]).toBeGreaterThan(350)
	})

	it("classifies subtropical forests when warm seasons are wet but interrupted", () => {
		const result = classifyCase(true, {
			temperatures: [10, 35, 10, 35, 10, 35, 10, 35, 10, 35, 10, 35],
			insolation: new Array(12).fill(400),
			rainfall: new Array(12).fill(70),
			pet: new Array(12).fill(60),
			aet: new Array(12).fill(55),
		})

		expect(pastaClimateName(result.zones[0])).toBe("Subtropical Forest")
		expect(result.debug.gint[0]).toBeLessThan(1250)
	})

	it("preserves land debug monthly metrics when classification reuses computed values", () => {
		const result = classifyCase(true, {
			temperatures: [10, 15, 20, 25, 30, 35, 35, 30, 25, 20, 15, 10],
			insolation: monthly(300),
			rainfall: monthly(80),
			pet: monthly(60),
			aet: monthly(50),
		})

		expect(result.debug.gdd[0]).toBeGreaterThan(0)
		expect(result.debug.gint[0]).toBeGreaterThan(0)
		expect(result.debug.gdd_monthly[5]).toBeGreaterThan(0)
		expect(result.debug.gint_monthly[5]).toBeGreaterThanOrEqual(0)
	})

	it("classifies tropical rainforests when warm wet conditions persist", () => {
		const result = classifyCase(true, {
			temperatures: new Array(12).fill(25),
			insolation: new Array(12).fill(300),
			rainfall: new Array(12).fill(120),
			pet: new Array(12).fill(100),
			aet: new Array(12).fill(95),
		})

		expect(pastaClimateName(result.zones[0])).toBe("Tropical Rainforest")
		expect(result.debug.gdd[0]).toBeGreaterThan(350)
		expect(result.debug.gint[0]).toBeLessThan(1250)
	})

	it("classifies hot forests when hot climates stay humid without pluvial runoff", () => {
		const result = classifyCase(true, {
			temperatures: new Array(12).fill(45),
			insolation: new Array(12).fill(400),
			rainfall: new Array(12).fill(70),
			pet: new Array(12).fill(60),
			aet: new Array(12).fill(55),
		})

		expect(pastaClimateName(result.zones[0])).toBe("Supertropical Forest")
	})

	it("distinguishes warm, hot, and extraseasonal oceans from temperature thresholds", () => {
		const tropical = classifyCase(false, {
			temperatures: new Array(12).fill(30),
			insolation: new Array(12).fill(240),
		})
		const hot = classifyCase(false, {
			temperatures: new Array(12).fill(50),
			insolation: new Array(12).fill(260),
		})
		const extraseasonal = classifyCase(false, {
			temperatures: [-5, -5, 0, 10, 20, 50, 50, 20, 10, 0, -5, -5],
			insolation: [0, 0, 40, 120, 180, 260, 260, 180, 120, 40, 0, 0],
		})

		expect(pastaClimateName(tropical.zones[0])).toBe("Tropical Ocean")
		expect(pastaClimateName(hot.zones[0])).toBe("Hot Ocean")
		expect(pastaClimateName(extraseasonal.zones[0])).toBe("Extraseasonal Ocean")
	})

	it("classifies seasonal frozen oceans when summer warmth briefly returns", () => {
		const result = classifyCase(
			false,
			{
				temperatures: [-10, -8, -4, 2, 8, 12, 12, 8, 2, -4, -8, -10],
				insolation: [0, 0, 40, 120, 220, 280, 280, 220, 120, 40, 0, 0],
			},
			{ iceMaxMonthly: 25 },
		)

		expect(pastaClimateName(result.zones[0])).toBe("Seasonal Frozen Ocean")
	})

	it("treats exact ocean ice cutoffs as unfrozen until they are exceeded", () => {
		const seasonalCandidate = {
			temperatures: [-10, -8, -4, 2, 8, 12, 12, 8, 2, -4, -8, -10],
			insolation: [0, 0, 40, 120, 220, 280, 280, 220, 120, 40, 0, 0],
		}
		const noIce = classifyCase(false, seasonalCandidate)
		const atSeasonalCutoff = classifyCase(false, seasonalCandidate, {
			iceMaxMonthly: 20,
		})
		const aboveSeasonalCutoff = classifyCase(false, seasonalCandidate, {
			iceMaxMonthly: 21,
		})
		const atPermanentCutoff = classifyCase(
			false,
			{
				temperatures: monthly(-20),
				insolation: monthly(0),
			},
			{ iceMinMonthly: 80 },
		)

		expect(pastaClimateName(atSeasonalCutoff.zones[0])).toBe(
			pastaClimateName(noIce.zones[0]),
		)
		expect(pastaClimateName(aboveSeasonalCutoff.zones[0])).toBe(
			"Seasonal Frozen Ocean",
		)
		expect(pastaClimateName(atPermanentCutoff.zones[0])).toBe("Barren Ocean")
	})

	it("covers dry and monsoonal tropical savanna outcomes", () => {
		const dry = classifyCase(true, {
			temperatures: new Array(12).fill(25),
			insolation: new Array(12).fill(320),
			rainfall: new Array(12).fill(40),
			pet: new Array(12).fill(140),
			aet: new Array(12).fill(55),
		})
		const monsoonal = classifyCase(true, {
			temperatures: new Array(12).fill(25),
			insolation: new Array(12).fill(320),
			rainfall: new Array(12).fill(320),
			pet: new Array(12).fill(100),
			aet: new Array(12).fill(40),
		})

		expect(pastaClimateName(dry.zones[0])).toContain("Dry Savanna")
		expect(pastaClimateName(monsoonal.zones[0])).toContain("Monsoon")
	})

	it("covers cool mediterranean and hot subparamediterranean branches", () => {
		const mediterranean = classifyCase(true, {
			temperatures: new Array(12).fill(12),
			insolation: new Array(12).fill(220),
			rainfall: new Array(12).fill(20),
			pet: new Array(12).fill(80),
			aet: new Array(12).fill(70),
		})
		const hotDry = classifyCase(true, {
			temperatures: new Array(12).fill(45),
			insolation: new Array(12).fill(380),
			rainfall: new Array(12).fill(20),
			pet: new Array(12).fill(70),
			aet: new Array(12).fill(45),
		})

		expect(pastaClimateName(mediterranean.zones[0])).toContain("mediterranean")
		expect(pastaClimateName(hotDry.zones[0])).toContain("Subparamediterranean")
	})

	it("covers barren ocean thresholds without ice and at torrid warmth", () => {
		const barren = classifyCase(false, {
			temperatures: monthly(-5),
			insolation: monthly(0),
		})
		const torrid = findClassifiedCase("Torrid Ocean", false, [
			{
				temperatures: [30, 35, 40, 45, 50, 60, 65, 60, 50, 45, 40, 35],
				insolation: monthly(260),
			},
			{
				temperatures: [20, 25, 30, 40, 50, 60, 65, 60, 50, 40, 30, 25],
				insolation: monthly(320),
			},
		])

		expect(pastaClimateName(barren.zones[0])).toBe("Barren Ocean")
		expect(pastaClimateName(torrid.zones[0])).toBe("Torrid Ocean")
		expect(torrid.debug.maxT[0]).toBeGreaterThanOrEqual(60)
	})

	it("removes persistent ice classifications once summer temperatures rise above freezing", () => {
		const result = classifyCase(
			true,
			{
				temperatures: [-5, -5, -4, -2, 1, 2, 2, 1, -2, -4, -5, -5],
				insolation: monthly(60),
				rainfall: monthly(10),
				pet: monthly(5),
				aet: monthly(5),
			},
			{ iceThickness: 101 },
		)

		expect(pastaClimateName(result.zones[0])).not.toBe("Ice")
		expect(result.debug.maxT[0]).toBeGreaterThan(0)
	})

	it("requires land ice thickness to exceed the threshold before classifying ice", () => {
		const frozenLand = {
			temperatures: monthly(-5),
			insolation: monthly(50),
			rainfall: monthly(10),
			pet: monthly(5),
			aet: monthly(5),
		}
		const noIce = classifyCase(true, frozenLand)
		const atThreshold = classifyCase(true, frozenLand, { iceThickness: 100 })
		const aboveThreshold = classifyCase(true, frozenLand, {
			iceThickness: 101,
		})

		expect(pastaClimateName(atThreshold.zones[0])).toBe(
			pastaClimateName(noIce.zones[0]),
		)
		expect(pastaClimateName(aboveThreshold.zones[0])).toBe("Ice")
	})

	it("covers barren and arid branches across tropical, hot, and extraseasonal land groups", () => {
		const tropicalDark = classifyCase(true, {
			temperatures: monthly(20),
			insolation: monthly(0),
			rainfall: monthly(0),
			pet: monthly(0),
			aet: monthly(0),
		})
		const hotBarren = classifyCase(true, {
			temperatures: monthly(50),
			insolation: monthly(0),
			rainfall: monthly(0),
			pet: monthly(0),
			aet: monthly(0),
		})
		const extraseasonalBarren = classifyCase(true, {
			temperatures: [-20, -10, 0, 10, 30, 50, 50, 30, 10, 0, -10, -20],
			insolation: monthly(0),
			rainfall: monthly(0),
			pet: monthly(0),
			aet: monthly(0),
		})
		const coldDesert = classifyCase(true, {
			temperatures: [-20, -15, -10, -5, 0, 10, 20, 10, 0, -5, -10, -15],
			insolation: monthly(320),
			rainfall: monthly(0),
			pet: monthly(300),
			aet: monthly(0),
		})
		const hotDesert = findClassifiedCase("Hot Desert", true, [
			{
				temperatures: [16, 18, 20, 25, 35, 45, 65, 45, 35, 25, 20, 18],
				insolation: monthly(320),
				rainfall: monthly(0),
				pet: monthly(300),
				aet: monthly(0),
			},
			{
				temperatures: [18, 20, 24, 30, 40, 50, 62, 50, 40, 30, 24, 20],
				insolation: monthly(360),
				rainfall: monthly(0),
				pet: monthly(260),
				aet: monthly(0),
			},
		])
		const hyperseasonalDesert = classifyCase(true, {
			temperatures: [-20, -10, 0, 20, 40, 70, 70, 40, 20, 0, -10, -20],
			insolation: monthly(360),
			rainfall: monthly(0),
			pet: monthly(300),
			aet: monthly(0),
		})
		const coldSemidesert = classifyCase(true, {
			temperatures: [-20, -15, -10, -5, 0, 10, 20, 10, 0, -5, -10, -15],
			insolation: monthly(320),
			rainfall: monthly(20),
			pet: monthly(150),
			aet: monthly(10),
		})
		const hotSemidesert = findClassifiedCase("Hot Semidesert", true, [
			{
				temperatures: [16, 18, 20, 25, 35, 45, 65, 45, 35, 25, 20, 18],
				insolation: monthly(320),
				rainfall: monthly(20),
				pet: monthly(150),
				aet: monthly(10),
			},
			{
				temperatures: [18, 20, 24, 30, 40, 50, 62, 50, 40, 30, 24, 20],
				insolation: monthly(360),
				rainfall: monthly(24),
				pet: monthly(160),
				aet: monthly(10),
			},
		])
		const hyperseasonalSemidesert = classifyCase(true, {
			temperatures: [-20, -10, 0, 20, 40, 70, 70, 40, 20, 0, -10, -20],
			insolation: monthly(360),
			rainfall: monthly(20),
			pet: monthly(150),
			aet: monthly(10),
		})

		expect(pastaClimateName(tropicalDark.zones[0])).toBe("Tropical Dark")
		expect(pastaClimateName(hotBarren.zones[0])).toBe("Hot Barren")
		expect(pastaClimateName(extraseasonalBarren.zones[0])).toBe(
			"Extraseasonal Barren",
		)
		expect(pastaClimateName(coldDesert.zones[0])).toBe("Cold Desert")
		expect(pastaClimateName(hotDesert.zones[0])).toBe("Hot Desert")
		expect(pastaClimateName(hyperseasonalDesert.zones[0])).toBe(
			"Hyperseasonal Desert",
		)
		expect(pastaClimateName(coldSemidesert.zones[0])).toBe("Cold Semidesert")
		expect(pastaClimateName(hotSemidesert.zones[0])).toBe("Hot Semidesert")
		expect(pastaClimateName(hyperseasonalSemidesert.zones[0])).toBe(
			"Hyperseasonal Semidesert",
		)
	})

	it("covers low-light twilight, parch, and pulse outcomes", () => {
		const twilight = classifyCase(true, {
			temperatures: monthly(20),
			insolation: monthly(30),
			rainfall: monthly(50),
			pet: monthly(40),
			aet: monthly(35),
		})
		const hotParch = classifyCase(true, {
			temperatures: monthly(45),
			insolation: monthly(30),
			rainfall: monthly(80),
			pet: monthly(90),
			aet: monthly(70),
		})
		const torridParch = findClassifiedCase("Torrid Parch", true, [
			{
				temperatures: [16, 18, 20, 25, 35, 45, 65, 45, 35, 25, 20, 18],
				insolation: monthly(30),
				rainfall: monthly(80),
				pet: monthly(90),
				aet: monthly(70),
			},
			{
				temperatures: [18, 20, 24, 30, 40, 50, 62, 50, 40, 30, 24, 20],
				insolation: monthly(24),
				rainfall: monthly(70),
				pet: monthly(85),
				aet: monthly(70),
			},
		])
		const boilingParch = findClassifiedCase("Boiling Parch", true, [
			{
				temperatures: [16, 18, 20, 25, 35, 45, 95, 45, 35, 25, 20, 18],
				insolation: monthly(30),
				rainfall: monthly(80),
				pet: monthly(90),
				aet: monthly(70),
			},
			{
				temperatures: [18, 20, 24, 30, 40, 55, 90, 55, 40, 30, 24, 20],
				insolation: monthly(24),
				rainfall: monthly(70),
				pet: monthly(85),
				aet: monthly(70),
			},
		])
		const superseasonalPulse = classifyCase(true, {
			temperatures: [-5, 0, 5, 15, 30, 50, 50, 30, 15, 5, 0, -5],
			insolation: monthly(30),
			rainfall: monthly(80),
			pet: monthly(90),
			aet: monthly(70),
		})
		const hyperseasonalPulse = classifyCase(true, {
			temperatures: [5, 10, 20, 30, 50, 70, 70, 50, 30, 20, 10, 5],
			insolation: monthly(30),
			rainfall: monthly(80),
			pet: monthly(90),
			aet: monthly(70),
		})

		expect(pastaClimateName(twilight.zones[0])).toBe("Tropical Twilight")
		expect(pastaClimateName(hotParch.zones[0])).toBe("Hot Parch")
		expect(pastaClimateName(torridParch.zones[0])).toBe("Torrid Parch")
		expect(pastaClimateName(boilingParch.zones[0])).toBe("Boiling Parch")
		expect(pastaClimateName(superseasonalPulse.zones[0])).toBe(
			"Superseasonal Pulse",
		)
		expect(pastaClimateName(hyperseasonalPulse.zones[0])).toBe(
			"Hyperseasonal Pulse",
		)
		expect(twilight.debug.gdd[0]).toBeLessThan(350)
		expect(hyperseasonalPulse.debug.gdd[0]).toBeLessThan(350)
	})

	it("distinguishes ocean and monsoon forest branches at exact thresholds", () => {
		const coolBoundary = classifyCase(false, {
			temperatures: monthly(15),
			insolation: monthly(240),
		})
		const tropicalBoundary = classifyCase(false, {
			temperatures: monthly(40),
			insolation: monthly(240),
		})
		const hotBoundary = classifyCase(false, {
			temperatures: [20, 25, 30, 35, 40, 50, 60, 50, 40, 35, 30, 25],
			insolation: monthly(320),
		})
		const torridAboveBoundary = classifyCase(false, {
			temperatures: [20, 25, 30, 40, 50, 60, 65, 60, 50, 40, 30, 25],
			insolation: monthly(320),
		})
		const subtropicalForest = classifyCase(true, {
			temperatures: [10, 35, 10, 35, 10, 35, 10, 35, 10, 35, 10, 35],
			insolation: monthly(400),
			rainfall: monthly(70),
			pet: monthly(60),
			aet: monthly(55),
		})
		const subtropicalMonsoonForest = classifyCase(true, {
			temperatures: [10, 35, 10, 35, 10, 35, 10, 35, 10, 35, 10, 35],
			insolation: monthly(400),
			rainfall: monthly(160),
			pet: monthly(60),
			aet: monthly(55),
		})

		expect(pastaClimateName(coolBoundary.zones[0])).toBe("Cool Ocean")
		expect(pastaClimateName(tropicalBoundary.zones[0])).toBe("Tropical Ocean")
		expect(pastaClimateName(hotBoundary.zones[0])).toBe("Hot Ocean")
		expect(pastaClimateName(torridAboveBoundary.zones[0])).toBe("Torrid Ocean")
		expect(pastaClimateName(subtropicalForest.zones[0])).toBe(
			"Subtropical Forest",
		)
		expect(pastaClimateName(subtropicalMonsoonForest.zones[0])).toBe(
			"Subtropical Monsoon Forest",
		)
	})

	it("covers continental temperate, boreal, and tundra inland branches", () => {
		const continentalTemperate = findClassifiedCase(
			"Continental Temperate",
			true,
			[
				{
					temperatures: [-8, -4, 2, 10, 18, 26, 30, 26, 18, 10, 2, -4],
					insolation: monthly(280),
					rainfall: monthly(50),
					pet: monthly(60),
					aet: monthly(48),
				},
				{
					temperatures: [-12, -8, -2, 8, 16, 24, 28, 24, 16, 8, -2, -8],
					insolation: monthly(260),
					rainfall: monthly(55),
					pet: monthly(65),
					aet: monthly(50),
				},
			],
		)
		const continentalRainforest = findClassifiedCase(
			"Continental Temperate Rainforest",
			true,
			[
				{
					temperatures: [-8, -4, 2, 10, 18, 26, 30, 26, 18, 10, 2, -4],
					insolation: monthly(280),
					rainfall: monthly(180),
					pet: monthly(50),
					aet: monthly(45),
				},
				{
					temperatures: [-12, -8, -2, 8, 16, 24, 28, 24, 16, 8, -2, -8],
					insolation: monthly(260),
					rainfall: monthly(160),
					pet: monthly(48),
					aet: monthly(42),
				},
			],
		)
		const continentalBoreal = findClassifiedCase("Continental Boreal", true, [
			{
				temperatures: [-25, -20, -10, 0, 8, 14, 18, 14, 8, 0, -10, -20],
				insolation: monthly(240),
				rainfall: monthly(60),
				pet: monthly(40),
				aet: monthly(32),
			},
			{
				temperatures: [-22, -18, -8, 1, 9, 15, 19, 15, 9, 1, -8, -18],
				insolation: monthly(220),
				rainfall: monthly(65),
				pet: monthly(42),
				aet: monthly(34),
			},
		])
		const continentalTundra = findClassifiedCase("Continental Tundra", true, [
			{
				temperatures: [-25, -20, -15, -10, -2, 4, 8, 4, -2, -10, -15, -20],
				insolation: monthly(120),
				rainfall: monthly(80),
				pet: monthly(60),
				aet: monthly(45),
			},
			{
				temperatures: [-22, -18, -14, -8, -1, 5, 9, 5, -1, -8, -14, -18],
				insolation: monthly(110),
				rainfall: monthly(70),
				pet: monthly(55),
				aet: monthly(40),
			},
		])

		expect(pastaClimateName(continentalTemperate.zones[0])).toBe(
			"Continental Temperate",
		)
		expect(pastaClimateName(continentalRainforest.zones[0])).toBe(
			"Continental Temperate Rainforest",
		)
		expect(pastaClimateName(continentalBoreal.zones[0])).toBe(
			"Continental Boreal",
		)
		expect(pastaClimateName(continentalTundra.zones[0])).toBe(
			"Continental Tundra",
		)
		expect(continentalTundra.debug.gdd[0]).toBeLessThan(350)
	})

	it("covers hot paramediterranean, steppe, and boiling swelter variants", () => {
		const hotParamediterranean = findClassifiedCase(
			"Hot Paramediterranean",
			true,
			[
				{
					temperatures: monthly(45),
					insolation: monthly(360),
					rainfall: monthly(12),
					pet: monthly(80),
					aet: monthly(30),
				},
				{
					temperatures: monthly(48),
					insolation: monthly(340),
					rainfall: monthly(10),
					pet: monthly(75),
					aet: monthly(28),
				},
			],
		)
		const torridSteppe = findClassifiedCase("Torrid Steppe", true, [
			{
				temperatures: [20, 25, 30, 40, 50, 60, 65, 60, 50, 40, 30, 25],
				insolation: monthly(360),
				rainfall: monthly(35),
				pet: monthly(90),
				aet: monthly(25),
			},
			{
				temperatures: [18, 22, 28, 38, 48, 58, 62, 58, 48, 38, 28, 22],
				insolation: monthly(340),
				rainfall: monthly(32),
				pet: monthly(84),
				aet: monthly(22),
			},
		])
		const boilingPluvialSwelter = findClassifiedCase(
			"Boiling Pluvial Swelter",
			true,
			[
				{
					temperatures: [25, 30, 35, 45, 60, 80, 95, 80, 60, 45, 35, 30],
					insolation: monthly(360),
					rainfall: monthly(180),
					pet: monthly(60),
					aet: monthly(42),
				},
				{
					temperatures: [22, 28, 34, 46, 62, 82, 92, 82, 62, 46, 34, 28],
					insolation: monthly(340),
					rainfall: monthly(160),
					pet: monthly(58),
					aet: monthly(40),
				},
			],
		)

		expect(pastaClimateName(hotParamediterranean.zones[0])).toBe(
			"Hot Paramediterranean",
		)
		expect(pastaClimateName(torridSteppe.zones[0])).toBe("Torrid Steppe")
		expect(pastaClimateName(boilingPluvialSwelter.zones[0])).toBe(
			"Boiling Pluvial Swelter",
		)
		expect(boilingPluvialSwelter.debug.maxT[0]).toBeGreaterThanOrEqual(90)
	})

	it("covers warm semidesert, monsoonal hot savanna, and non-pluvial boiling swelter branches", () => {
		const warmSemidesert = findClassifiedCase("Warm Semidesert", true, [
			{
				temperatures: monthly(25),
				insolation: monthly(320),
				rainfall: monthly(18),
				pet: monthly(120),
				aet: monthly(12),
			},
			{
				temperatures: monthly(28),
				insolation: monthly(300),
				rainfall: monthly(20),
				pet: monthly(140),
				aet: monthly(14),
			},
		])
		const hotDryMonsoonSavanna = findClassifiedCase(
			"Hot Dry Monsoon Savanna",
			true,
			[
				{
					temperatures: monthly(45),
					insolation: monthly(360),
					rainfall: monthly(320),
					pet: monthly(100),
					aet: monthly(40),
				},
				{
					temperatures: monthly(48),
					insolation: monthly(340),
					rainfall: monthly(280),
					pet: monthly(96),
					aet: monthly(38),
				},
			],
		)
		const boilingSwelter = findClassifiedCase("Boiling Swelter", true, [
			{
				temperatures: [25, 30, 35, 45, 60, 80, 95, 80, 60, 45, 35, 30],
				insolation: monthly(360),
				rainfall: monthly(40),
				pet: monthly(60),
				aet: monthly(42),
			},
			{
				temperatures: [22, 28, 34, 46, 62, 82, 92, 82, 62, 46, 34, 28],
				insolation: monthly(340),
				rainfall: monthly(36),
				pet: monthly(58),
				aet: monthly(40),
			},
		])

		expect(pastaClimateName(warmSemidesert.zones[0])).toBe("Warm Semidesert")
		expect(pastaClimateName(hotDryMonsoonSavanna.zones[0])).toBe(
			"Hot Dry Monsoon Savanna",
		)
		expect(pastaClimateName(boilingSwelter.zones[0])).toBe("Boiling Swelter")
		expect(boilingSwelter.debug.maxT[0]).toBeGreaterThanOrEqual(90)
	})

	it("covers torrid subparamediterranean and extratropical forest return lines", () => {
		const torridSubparamediterranean = findClassifiedCase(
			"Torrid Subparamediterranean",
			true,
			[
				{
					temperatures: [20, 25, 30, 40, 50, 60, 65, 60, 50, 40, 30, 25],
					insolation: monthly(360),
					rainfall: monthly(20),
					pet: monthly(60),
					aet: monthly(45),
				},
				{
					temperatures: [18, 22, 28, 38, 48, 58, 62, 58, 48, 38, 28, 22],
					insolation: monthly(340),
					rainfall: monthly(18),
					pet: monthly(58),
					aet: monthly(42),
				},
			],
		)
		const extratropicalForest = findClassifiedCase(
			"Extratropical Forest",
			true,
			[
				{
					temperatures: [5, 10, 15, 20, 30, 45, 45, 30, 20, 15, 10, 5],
					insolation: monthly(360),
					rainfall: monthly(70),
					pet: monthly(60),
					aet: monthly(55),
				},
				{
					temperatures: [4, 8, 12, 18, 28, 42, 48, 42, 28, 18, 12, 8],
					insolation: monthly(320),
					rainfall: monthly(68),
					pet: monthly(58),
					aet: monthly(52),
				},
			],
		)

		expect(pastaClimateName(torridSubparamediterranean.zones[0])).toBe(
			"Torrid Subparamediterranean",
		)
		expect(pastaClimateName(extratropicalForest.zones[0])).toBe(
			"Extratropical Forest",
		)
		expect(extratropicalForest.debug.gint[0]).toBeLessThan(1250)
	})

	it("finds additional tropical and quasitropical humid branches across a stable search grid", () => {
		const matches = classifySearchGrid(true, {
			temperatureProfiles: [
				monthly(22),
				monthly(25),
				monthly(28),
				[16, 18, 20, 22, 24, 28, 32, 28, 24, 22, 20, 18],
				[18, 20, 22, 24, 26, 30, 34, 30, 26, 24, 22, 20],
			],
			insolations: [120, 160, 200, 240, 280, 320],
			rainfalls: [20, 40, 80, 120, 160, 240, 320],
			pets: [40, 60, 80, 100, 120, 140],
			aets: [20, 40, 50, 60, 80, 95],
		})
		const expected = [
			"Hyperpluvial Tropical Rainforest",
			"Tropical Forest",
			"Tropical Monsoon Forest",
			"Tropical Moist Savanna",
			"Tropical Moist Monsoon Savanna",
			"Quasitropical Forest",
			"Quasitropical Monsoon Forest",
			"Quasitropical Moist Savanna",
			"Quasitropical Moist Monsoon Savanna",
		]

		expect(expected.filter((name) => !matches.has(name))).toEqual([])
		expect(
			matches.get("Quasitropical Forest")?.debug.gint[0],
		).toBeGreaterThanOrEqual(1250)
	})

	it("finds additional cool-group climates covering mediterranean, steppe, and boreal rainforests", () => {
		const matches = classifySearchGrid(true, {
			temperatureProfiles: [
				monthly(12),
				monthly(8),
				[-5, 0, 5, 10, 15, 20, 25, 20, 15, 10, 5, 0],
				[-12, -6, 0, 8, 16, 24, 28, 24, 16, 8, 0, -6],
				[-20, -14, -8, 0, 8, 16, 22, 16, 8, 0, -8, -14],
				[-30, -24, -16, -8, 0, 6, 12, 6, 0, -8, -16, -24],
				[-36, -30, -22, -12, -2, 6, 14, 6, -2, -12, -22, -30],
				[-42, -36, -28, -16, -6, 4, 12, 4, -6, -16, -28, -36],
				[-38, -32, -22, -10, 2, 12, 20, 12, 2, -10, -22, -32],
				[-42, -34, -24, -12, 0, 10, 18, 10, 0, -12, -24, -34],
			],
			insolations: [120, 160, 200, 240, 280, 320, 360],
			rainfalls: [10, 20, 40, 60, 100, 160, 240],
			pets: [20, 40, 60, 80, 100, 120],
			aets: [10, 20, 30, 40, 50, 60, 80],
		})
		const expected = [
			"Oceanic Mediterranean",
			"Continental Mediterranean",
			"Oceanic Submediterranean",
			"Continental Submediterranean",
			"Cool Dry Savanna",
			"Cool Dry Monsoon Savanna",
			"Cold Steppe",
			"Cold Pluvial Steppe",
			"Oceanic Boreal Rainforest",
			"Continental Boreal Rainforest",
			"Percontinental Boreal",
			"Percontinental Boreal Rainforest",
		]

		expect(expected.filter((name) => !matches.has(name))).toEqual([])
		expect(matches.get("Percontinental Boreal")?.debug.gdd[0]).toBeLessThan(
			1300,
		)
	})

	it("finds additional hot and extratropical climates for swelter, monsoon, and seasonal branches", () => {
		const hotMatches = classifySearchGrid(true, {
			temperatureProfiles: [
				monthly(45),
				monthly(55),
				[18, 22, 28, 36, 48, 58, 62, 58, 48, 36, 28, 22],
				[20, 25, 30, 40, 50, 60, 65, 60, 50, 40, 30, 25],
				[22, 28, 34, 46, 62, 82, 92, 82, 62, 46, 34, 28],
			],
			insolations: [120, 180, 240, 300, 360],
			rainfalls: [20, 40, 80, 120, 180, 260, 320],
			pets: [40, 60, 80, 100, 120],
			aets: [20, 30, 40, 50, 60, 80],
		})
		const extratropicalMatches = classifySearchGrid(true, {
			temperatureProfiles: [
				[5, 10, 15, 20, 30, 40, 45, 40, 30, 20, 15, 10],
				[0, 5, 10, 20, 30, 45, 55, 45, 30, 20, 10, 5],
				[-5, 0, 5, 15, 30, 50, 50, 30, 15, 5, 0, -5],
				[10, 15, 20, 30, 45, 60, 70, 60, 45, 30, 20, 15],
			],
			insolations: [80, 120, 160, 220, 280, 340],
			rainfalls: [20, 40, 80, 120, 180, 260],
			pets: [40, 60, 80, 100],
			aets: [20, 30, 40, 50, 70],
		})
		const hotExpected = [
			"Supertropical Forest",
			"Supertropical Monsoon Forest",
			"Supertropical Moist Savanna",
			"Supertropical Moist Monsoon Savanna",
			"Hot Swelter",
			"Hot Pluvial Swelter",
			"Torrid Swelter",
			"Torrid Pluvial Swelter",
			"Boiling Steppe",
			"Boiling Pluvial Steppe",
			"Boiling Subparamediterranean",
		]
		const extratropicalExpected = [
			"Extratropical Monsoon Forest",
			"Extratropical Moist Savanna",
			"Extratropical Moist Monsoon Savanna",
			"Superseasonal Extracontinental",
			"Superseasonal Extracontinental Rainforest",
			"Hyperseasonal Extracontinental",
			"Hyperseasonal Extracontinental Rainforest",
			"Superseasonal Dry Savanna",
			"Superseasonal Dry Monsoon Savanna",
			"Hyperseasonal Steppe",
			"Hyperseasonal Pluvial Steppe",
		]

		expect(hotExpected.filter((name) => !hotMatches.has(name))).toEqual([])
		expect(
			extratropicalExpected.filter((name) => !extratropicalMatches.has(name)),
		).toEqual([])
		expect(
			hotMatches.get("Boiling Steppe")?.debug.maxT[0],
		).toBeGreaterThanOrEqual(90)
		expect(
			extratropicalMatches.get("Extratropical Monsoon Forest")?.debug.gint[0],
		).toBeLessThan(1250)
	})
})

describe("pasta palette helpers", () => {
	it("returns fallback colors and names at invalid zone-id boundaries", () => {
		expect(pastaClimateColor(0)).toEqual([0.05, 0.08, 0.18])
		expect(pastaClimateColor(-1)).toEqual([0.05, 0.08, 0.18])
		expect(pastaClimateName(-1)).toBe("Ocean")
		expect(pastaClimateName(999)).toBe("Ocean")
	})

	it("maps known climate codes to normalized color triplets", () => {
		const ocean = classifyCase(false, {
			temperatures: new Array(12).fill(30),
			insolation: new Array(12).fill(240),
		})

		expect(pastaClimateColor(ocean.zones[0])).toHaveLength(3)
		expect(
			pastaClimateColor(ocean.zones[0]).every(
				(value) => value >= 0 && value <= 1,
			),
		).toBe(true)
	})
})
