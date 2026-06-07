import { describe, expect, it } from "vitest"
import { REL } from "@/model/history/state"
import {
	CULTURE_GENDER_SYSTEM,
	leaderGenderSymbol,
	resolveLeaderGender,
} from "@/model/society/gender-system"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import { getHoverClimateDisplay, getHoverTradeGood } from "./hover"
import {
	buildClimateSwatchColor,
	buildDemographicDisplayData,
	buildHoverChartData,
	buildHoverNationRelationDistribution,
	buildPastaMonthlyData,
	buildPoliticalDisplayData,
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
			isLake: undefined,
			iceThickness: 3,
			iceMin: 5,
			iceMax: 7,
		})
	})

	it("marks lake regions separately from land regions for chart gating", () => {
		const world = makeWorld({
			mesh: { numRegions: 1 },
			isLand: new Uint8Array([0]),
			rivers: {
				lakes: new Uint8Array([1]),
			},
		})

		const result = buildHoverChartData({ region: 0 } as never, 0.2, world)

		expect(result).toMatchObject({
			isLand: 0,
			isLake: 1,
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

describe("buildHoverNationRelationDistribution", () => {
	it("returns empty array when hoverNationId is null or adjacency is missing", () => {
		expect(
			buildHoverNationRelationDistribution({
				hoverNationId: null,
				adjOffset: new Int32Array([0, 1]),
				adjList: new Int32Array([1]),
				nationCounts: new Map([[1, 1]]),
				relationAt: () => REL.ALLY,
			}),
		).toEqual([])

		expect(
			buildHoverNationRelationDistribution({
				hoverNationId: 0,
				adjOffset: null,
				adjList: new Int32Array([1]),
				nationCounts: new Map([[1, 1]]),
				relationAt: () => REL.ALLY,
			}),
		).toEqual([])

		expect(
			buildHoverNationRelationDistribution({
				hoverNationId: 0,
				adjOffset: new Int32Array([0, 1]),
				adjList: null,
				nationCounts: new Map([[1, 1]]),
				relationAt: () => REL.ALLY,
			}),
		).toEqual([])

		expect(
			buildHoverNationRelationDistribution({
				hoverNationId: 0,
				adjOffset: new Int32Array([0, 1]),
				adjList: new Int32Array([1]),
				nationCounts: new Map([[1, 1]]),
				relationAt: null,
			}),
		).toEqual([])
	})

	it("counts neighbors into the correct relation buckets", () => {
		const adjOffset = new Int32Array([0, 8, 8, 8, 8, 8, 8, 8, 8, 8])
		const adjList = new Int32Array([1, 2, 3, 4, 5, 6, 7, 8])
		const nationCounts = new Map(
			[0, 1, 2, 3, 4, 5, 6, 7, 8].map((id) => [id, 1]),
		)
		const relations: Record<number, number> = {
			1: REL.PU_SENIOR,
			2: REL.PU_JUNIOR,
			3: REL.OVERLORD,
			4: REL.VASSAL,
			5: REL.ALLY,
			6: REL.FRIENDLY,
			7: REL.SUSPICIOUS,
			8: REL.RIVAL,
		}
		const result = buildHoverNationRelationDistribution({
			hoverNationId: 0,
			adjOffset,
			adjList,
			nationCounts,
			relationAt: (_, b) => relations[b] ?? REL.NEUTRAL,
		})
		expect(result).toHaveLength(9)
		const byLabel = Object.fromEntries(result.map((b) => [b.label, b.count]))
		expect(byLabel["Personal Union"]).toBe(2)
		expect(byLabel["Colony"]).toBe(0)
		expect(byLabel["Vassal"]).toBe(2)
		expect(byLabel["Allied"]).toBe(1)
		expect(byLabel["Friendly"]).toBe(1)
		expect(byLabel["Suspicious"]).toBe(1)
		expect(byLabel["Rival"]).toBe(1)
		expect(byLabel["Neutral"]).toBe(0)
		expect(byLabel["War"]).toBe(0)
		expect(result.every((b) => b.shortLabel.length > 0)).toBe(true)
	})

	it("counts war neighbors and skips nations not in nationCounts", () => {
		const adjOffset = new Int32Array([0, 3, 3])
		const adjList = new Int32Array([1, 2, 99])
		const nationCounts = new Map([
			[0, 1],
			[1, 1],
			[2, 1],
		])
		const result = buildHoverNationRelationDistribution({
			hoverNationId: 0,
			adjOffset,
			adjList,
			nationCounts,
			relationAt: (_, b) => (b === 1 ? REL.WAR : REL.NEUTRAL),
		})
		const byLabel = Object.fromEntries(result.map((b) => [b.label, b.count]))
		expect(byLabel["War"]).toBe(1)
		expect(byLabel["Neutral"]).toBe(1)
	})

	it("returns empty when hoverNationId is out of adjOffset bounds", () => {
		const result = buildHoverNationRelationDistribution({
			hoverNationId: 5,
			adjOffset: new Int32Array([0, 1]),
			adjList: new Int32Array([1]),
			nationCounts: new Map([[1, 1]]),
			relationAt: () => REL.ALLY,
		})
		expect(result).toEqual([])
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
	it("returns province and nation colors from world data when the hovered province is valid", () => {
		const result = buildProvinceDisplayData({
			hoverProvince: 1,
			hoverNationId: 1,
			world: makeWorld({
				nations: {
					assignment: new Int32Array([0, 1]),
					colors: new Float32Array([0, 0, 0, 0.5, 0.6, 0.7]),
				},
				provinces: {
					colors: new Float32Array([1, 0, 0, 0, 1, 0]),
				},
			}),
		})

		expect(result.provinceColor).toMatch(/^rgb/)
		expect(result.provinceNation).toEqual({
			id: 1,
			color: "rgb(194, 206, 218)",
		})
	})

	it("nation color is always from world.nations.colors regardless of hovered region color", () => {
		const world = makeWorld({
			nations: {
				assignment: new Int32Array([0, 1]),
				colors: new Float32Array([0, 0, 0, 1, 0, 0]),
			},
			provinces: {
				colors: new Float32Array([0, 1, 0, 0, 0, 1]),
			},
		})

		const result = buildProvinceDisplayData({
			hoverProvince: 1,
			hoverNationId: 1,
			world,
		})

		expect(result.provinceNation?.color).toBe("rgb(255, 133, 133)")
	})

	it("returns null province details for invalid province inputs", () => {
		const result = buildProvinceDisplayData({
			hoverProvince: -1,
			hoverNationId: null,
			world: makeWorld({
				nations: {
					assignment: new Int32Array([0]),
					colors: new Float32Array([1, 0, 0]),
				},
				provinces: {
					colors: new Float32Array([1, 0, 0]),
				},
			}),
		})

		expect(result).toEqual({
			provinceColor: null,
			provinceNation: null,
		})
	})
	it("returns null nation color when nations.colors is absent or nation id is out of bounds", () => {
		const noColors = buildProvinceDisplayData({
			hoverProvince: 0,
			hoverNationId: 0,
			world: makeWorld({
				nations: {
					assignment: new Int32Array([0]),
				},
				provinces: {
					colors: new Float32Array([1, 0, 0]),
				},
			}),
		})
		expect(noColors.provinceNation?.color).toBeNull()

		const outOfBounds = buildProvinceDisplayData({
			hoverProvince: 0,
			hoverNationId: 5,
			world: makeWorld({
				nations: {
					assignment: new Int32Array([5]),
					colors: new Float32Array([1, 0, 0]),
				},
				provinces: {
					colors: new Float32Array([1, 0, 0]),
				},
			}),
		})
		expect(outOfBounds.provinceNation?.color).toBeNull()
	})
})

describe("buildPoliticalDisplayData", () => {
	it("returns dynasty and ruler details for a valid hovered nation", () => {
		const result = buildPoliticalDisplayData({
			hoverNationId: 1,
			selectedTimeMs: 123,
			world: makeWorld({
				leaderDynasty: new Int32Array([-1, 7]),
				leaderNameSeed: new Int32Array([-1, 99]),
				leaderBirthYear: new Float32Array([-1, 0]),
				cultures: {
					assignment: new Int32Array([0, 0]),
					genderSystems: new Uint8Array([CULTURE_GENDER_SYSTEM.PATRIARCHAL]),
				},
			}),
			getLeaderName: (nationId, timeMs) => `Leader ${nationId}@${timeMs}`,
			getDynastyName: (dynastyId) => `Dynasty ${dynastyId}`,
		})

		expect(result.dynasty).toEqual({
			id: 7,
			name: "Dynasty 7",
			color: expect.stringMatching(/^rgb/),
		})
		expect(result.ruler).toEqual({
			name: "Leader 1@123",
			age: 0,
			genderSymbol: leaderGenderSymbol(
				resolveLeaderGender(CULTURE_GENDER_SYSTEM.PATRIARCHAL, 99),
			),
		})
	})

	it("falls back cleanly when nation, dynasty, or time data is missing", () => {
		expect(
			buildPoliticalDisplayData({
				hoverNationId: null,
				selectedTimeMs: 123,
				world: makeWorld({}),
			}),
		).toEqual({ dynasty: null, ruler: null })

		expect(
			buildPoliticalDisplayData({
				hoverNationId: 0,
				selectedTimeMs: null,
				world: makeWorld({
					leaderDynasty: new Int32Array([-1]),
				}),
				getLeaderName: () => "Leader 0",
				getDynastyName: () => "Dynasty 0",
			}),
		).toEqual({ dynasty: null, ruler: null })
	})

	it("keeps dynasty details when ruler resolution is unavailable", () => {
		const result = buildPoliticalDisplayData({
			hoverNationId: 0,
			selectedTimeMs: null,
			world: makeWorld({
				leaderDynasty: new Int32Array([3]),
			}),
			getDynastyName: (dynastyId) => `Dynasty ${dynastyId}`,
		})

		expect(result).toEqual({
			dynasty: {
				id: 3,
				name: "Dynasty 3",
				color: expect.stringMatching(/^rgb/),
			},
			ruler: null,
		})
	})

	it("keeps ruler details when dynasty naming is unavailable", () => {
		const result = buildPoliticalDisplayData({
			hoverNationId: 0,
			selectedTimeMs: 50,
			world: makeWorld({
				leaderDynasty: new Int32Array([8]),
			}),
			getLeaderName: (nationId, timeMs) => `Leader ${nationId}@${timeMs}`,
		})

		expect(result).toEqual({
			dynasty: null,
			ruler: {
				name: "Leader 0@50",
				age: null,
				genderSymbol: null,
			},
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

describe("getHoverClimateDisplay", () => {
	const pasta = { code: "Af", name: "Tropical Rainforest" }
	const koppen = { code: "Cfb", name: "Oceanic" }

	it("returns null when no data is present", () => {
		expect(getHoverClimateDisplay("terrain", null, null, null)).toBeNull()
	})

	it("shows basic climate zone by default", () => {
		expect(getHoverClimateDisplay("terrain", pasta, null, "temperate")).toBe(
			"temperate",
		)
	})

	it("shows pasta climate name in lowercase without code in pastaClimate mode", () => {
		expect(
			getHoverClimateDisplay("pastaClimate", pasta, null, "tropical"),
		).toBe("tropical rainforest")
	})

	it("shows basic climate zone when pasta absent in pastaClimate mode", () => {
		expect(getHoverClimateDisplay("pastaClimate", null, null, "tropical")).toBe(
			"tropical",
		)
	})

	it("shows koppen climate in koppenClimate mode", () => {
		expect(
			getHoverClimateDisplay("koppenClimate", null, koppen, "temperate"),
		).toBe("Oceanic (Cfb)")
	})

	it("shows basic climate zone outside koppenClimate mode", () => {
		expect(getHoverClimateDisplay("terrain", null, koppen, "temperate")).toBe(
			"temperate",
		)
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

describe("buildDemographicDisplayData", () => {
	it("formats population density for density mode", () => {
		const result = buildDemographicDisplayData({
			populationMode: "density",
			hoverProvince: 0,
			world: makeWorld({
				params: { planetRadiusKm: 1000 },
				provinces: {
					desolate: new Uint8Array([0]),
					size: new Float32Array([2]),
				},
				population: {
					population: new Float32Array([125000]),
				},
			}),
			unitSystem: "metric",
			getCultureName: (id) => `culture-${id}`,
			getHeritageName: (id) => `heritage-${id}`,
			getFaithName: (id) => `faith-${id}`,
			getReligionName: (id) => `religion-${id}`,
		})

		expect(result?.label).toBe("Population")
		expect(result?.value).toContain("125K")
		expect(result?.value).toContain("km")
	})

	it("resolves cultural partitions and swatch colors for culture mode", () => {
		const result = buildDemographicDisplayData({
			populationMode: "culture",
			hoverProvince: 0,
			world: makeWorld({
				provinces: {
					desolate: new Uint8Array([0]),
					size: new Float32Array([1]),
				},
				cultures: {
					assignment: new Int32Array([1]),
					colors: new Float32Array([1, 0, 0, 0, 1, 0]),
				},
			}),
			unitSystem: "metric",
			getCultureName: (id) => `culture-${id}`,
			getHeritageName: (id) => `heritage-${id}`,
			getFaithName: (id) => `faith-${id}`,
			getReligionName: (id) => `religion-${id}`,
		})

		expect(result).toEqual({
			label: "Culture",
			value: "culture-1",
			color: expect.stringMatching(/^rgb/),
		})
	})

	it("returns null when the hovered demographic province is missing or desolate", () => {
		expect(
			buildDemographicDisplayData({
				populationMode: "development",
				hoverProvince: null,
				world: makeWorld({}),
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toBeNull()
	})

	it("returns plain rows for development demographic mode", () => {
		const world = makeWorld({
			provinces: {
				desolate: new Uint8Array([0]),
				size: new Float32Array([1]),
			},
			development: new Float32Array([0.75]),
		})

		expect(
			buildDemographicDisplayData({
				populationMode: "development",
				hoverProvince: 0,
				world,
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toEqual({
			label: "Development",
			value: "0.75",
			color: null,
		})
	})

	it("shows 'Cradle' label at wave=0 for migration mode", () => {
		const world = makeWorld({
			provinces: { desolate: new Uint8Array([0]), size: new Float32Array([1]) },
			population: { migrationWave: new Float32Array([0]) },
		})
		expect(
			buildDemographicDisplayData({
				populationMode: "migration",
				hoverProvince: 0,
				world,
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toEqual({ label: "Migration", value: "Cradle", color: null })
	})

	it("shows percentage for mid-range migration wave", () => {
		const world = makeWorld({
			provinces: { desolate: new Uint8Array([0]), size: new Float32Array([1]) },
			population: { migrationWave: new Float32Array([0.42]) },
		})
		expect(
			buildDemographicDisplayData({
				populationMode: "migration",
				hoverProvince: 0,
				world,
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toEqual({ label: "Migration", value: "42%", color: null })
	})

	it("returns null for migration mode when province is desolate or wave is -1", () => {
		const desolateWorld = makeWorld({
			provinces: { desolate: new Uint8Array([1]), size: new Float32Array([1]) },
			population: { migrationWave: new Float32Array([0.5]) },
		})
		expect(
			buildDemographicDisplayData({
				populationMode: "migration",
				hoverProvince: 0,
				world: desolateWorld,
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toBeNull()

		const unreachableWorld = makeWorld({
			provinces: { desolate: new Uint8Array([0]), size: new Float32Array([1]) },
			population: { migrationWave: new Float32Array([-1]) },
		})
		expect(
			buildDemographicDisplayData({
				populationMode: "migration",
				hoverProvince: 0,
				world: unreachableWorld,
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toBeNull()
	})

	it("resolves heritage, faith, and religion chains from the hovered culture", () => {
		const world = makeWorld({
			provinces: {
				desolate: new Uint8Array([0]),
				size: new Float32Array([1]),
			},
			cultures: {
				assignment: new Int32Array([1]),
				colors: new Float32Array([1, 0, 0, 0, 1, 0]),
			},
			heritages: {
				assignment: new Int32Array([0, 2]),
				colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
			},
			faiths: {
				assignment: new Int32Array([0, 3]),
				colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0]),
			},
			religions: {
				assignment: new Int32Array([0, 0, 0, 4]),
				colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 1]),
			},
		})

		expect(
			buildDemographicDisplayData({
				populationMode: "heritage",
				hoverProvince: 0,
				world,
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toEqual({
			label: "Heritage",
			value: "heritage-2",
			color: expect.stringMatching(/^rgb/),
		})
		expect(
			buildDemographicDisplayData({
				populationMode: "faith",
				hoverProvince: 0,
				world,
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toEqual({
			label: "Faith",
			value: "faith-3",
			color: expect.stringMatching(/^rgb/),
		})
		expect(
			buildDemographicDisplayData({
				populationMode: "religion",
				hoverProvince: 0,
				world,
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toEqual({
			label: "Religion",
			value: "religion-4",
			color: expect.stringMatching(/^rgb/),
		})
	})

	it("handles density fallback and partition fallback branches", () => {
		expect(
			buildDemographicDisplayData({
				populationMode: "density",
				hoverProvince: 0,
				world: makeWorld({
					params: { planetRadiusKm: 1000 },
					provinces: {
						desolate: new Uint8Array([0]),
						size: new Float32Array([0]),
					},
					population: {
						population: new Float32Array([0]),
					},
				}),
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toBeNull()

		expect(
			buildDemographicDisplayData({
				populationMode: "faith",
				hoverProvince: 0,
				world: makeWorld({
					provinces: {
						desolate: new Uint8Array([0]),
						size: new Float32Array([1]),
					},
					cultures: {
						assignment: new Int32Array([1]),
						colors: new Float32Array([1, 0, 0, 0, 1, 0]),
					},
				}),
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toBeNull()
	})

	it("keeps demographic labels even when partition colors are unavailable", () => {
		const result = buildDemographicDisplayData({
			populationMode: "culture",
			hoverProvince: 0,
			world: makeWorld({
				provinces: {
					desolate: new Uint8Array([0]),
					size: new Float32Array([1]),
				},
				cultures: {
					assignment: new Int32Array([1]),
					colors: new Float32Array([1, 0, 0]),
				},
			}),
			unitSystem: "metric",
			getCultureName: (id) => `culture-${id}`,
			getHeritageName: (id) => `heritage-${id}`,
			getFaithName: (id) => `faith-${id}`,
			getReligionName: (id) => `religion-${id}`,
		})

		expect(result).toEqual({
			label: "Culture",
			value: "culture-1",
			color: null,
		})
	})

	it("covers small and large population formatting branches", () => {
		const small = buildDemographicDisplayData({
			populationMode: "density",
			hoverProvince: 0,
			world: makeWorld({
				provinces: {
					desolate: new Uint8Array([0]),
					size: new Float32Array([0]),
				},
				population: {
					population: new Float32Array([500]),
				},
			}),
			unitSystem: "metric",
			getCultureName: (id) => `culture-${id}`,
			getHeritageName: (id) => `heritage-${id}`,
			getFaithName: (id) => `faith-${id}`,
			getReligionName: (id) => `religion-${id}`,
		})
		const large = buildDemographicDisplayData({
			populationMode: "density",
			hoverProvince: 0,
			world: makeWorld({
				provinces: {
					desolate: new Uint8Array([0]),
					size: new Float32Array([1]),
				},
				population: {
					population: new Float32Array([2_500_000]),
				},
			}),
			unitSystem: "metric",
			getCultureName: (id) => `culture-${id}`,
			getHeritageName: (id) => `heritage-${id}`,
			getFaithName: (id) => `faith-${id}`,
			getReligionName: (id) => `religion-${id}`,
		})

		expect(small?.value).toContain("500")
		expect(small?.value).toContain("km")
		expect(large?.value).toContain("2.5M")
	})

	it("returns null when demographic assignment chains are missing", () => {
		expect(
			buildDemographicDisplayData({
				populationMode: "culture",
				hoverProvince: 0,
				world: makeWorld({
					provinces: {
						desolate: new Uint8Array([0]),
						size: new Float32Array([1]),
					},
					cultures: {
						assignment: new Int32Array([-1]),
						colors: new Float32Array([1, 0, 0]),
					},
				}),
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toBeNull()

		expect(
			buildDemographicDisplayData({
				populationMode: "religion",
				hoverProvince: 0,
				world: makeWorld({
					provinces: {
						desolate: new Uint8Array([0]),
						size: new Float32Array([1]),
					},
					cultures: {
						assignment: new Int32Array([1]),
						colors: new Float32Array([1, 0, 0, 0, 1, 0]),
					},
					faiths: {
						assignment: new Int32Array([0, -1]),
						colors: new Float32Array([1, 0, 0, 0, 1, 0]),
					},
				}),
				unitSystem: "metric",
				getCultureName: (id) => `culture-${id}`,
				getHeritageName: (id) => `heritage-${id}`,
				getFaithName: (id) => `faith-${id}`,
				getReligionName: (id) => `religion-${id}`,
			}),
		).toBeNull()
	})
})

describe("buildHoverNationRelationDistribution", () => {
	it("returns empty array when hoverNationId is null or adjacency is missing", () => {
		expect(
			buildHoverNationRelationDistribution({
				hoverNationId: null,
				adjOffset: new Int32Array([0, 1]),
				adjList: new Int32Array([1]),
				nationCounts: new Map([[1, 1]]),
				relationAt: () => REL.ALLY,
			}),
		).toEqual([])

		expect(
			buildHoverNationRelationDistribution({
				hoverNationId: 0,
				adjOffset: null,
				adjList: new Int32Array([1]),
				nationCounts: new Map([[1, 1]]),
				relationAt: () => REL.ALLY,
			}),
		).toEqual([])

		expect(
			buildHoverNationRelationDistribution({
				hoverNationId: 0,
				adjOffset: new Int32Array([0, 1]),
				adjList: null,
				nationCounts: new Map([[1, 1]]),
				relationAt: () => REL.ALLY,
			}),
		).toEqual([])

		expect(
			buildHoverNationRelationDistribution({
				hoverNationId: 0,
				adjOffset: new Int32Array([0, 1]),
				adjList: new Int32Array([1]),
				nationCounts: new Map([[1, 1]]),
				relationAt: null,
			}),
		).toEqual([])
	})

	it("counts neighbors into the correct relation buckets", () => {
		const adjOffset = new Int32Array([0, 8, 8, 8, 8, 8, 8, 8, 8, 8])
		const adjList = new Int32Array([1, 2, 3, 4, 5, 6, 7, 8])
		const nationCounts = new Map(
			[0, 1, 2, 3, 4, 5, 6, 7, 8].map((id) => [id, 1]),
		)
		const relations: Record<number, number> = {
			1: REL.PU_SENIOR,
			2: REL.PU_JUNIOR,
			3: REL.OVERLORD,
			4: REL.VASSAL,
			5: REL.ALLY,
			6: REL.FRIENDLY,
			7: REL.SUSPICIOUS,
			8: REL.RIVAL,
		}
		const result = buildHoverNationRelationDistribution({
			hoverNationId: 0,
			adjOffset,
			adjList,
			nationCounts,
			relationAt: (_, b) => relations[b] ?? REL.NEUTRAL,
		})
		expect(result).toHaveLength(9)
		const byLabel = Object.fromEntries(result.map((b) => [b.label, b.count]))
		expect(byLabel["Personal Union"]).toBe(2)
		expect(byLabel["Colony"]).toBe(0)
		expect(byLabel["Vassal"]).toBe(2)
		expect(byLabel["Allied"]).toBe(1)
		expect(byLabel["Friendly"]).toBe(1)
		expect(byLabel["Suspicious"]).toBe(1)
		expect(byLabel["Rival"]).toBe(1)
		expect(byLabel["Neutral"]).toBe(0)
		expect(byLabel["War"]).toBe(0)
	})

	it("counts war neighbors and skips nations not in nationCounts", () => {
		const adjOffset = new Int32Array([0, 3, 3])
		const adjList = new Int32Array([1, 2, 99])
		const nationCounts = new Map([
			[0, 1],
			[1, 1],
			[2, 1],
		])
		const result = buildHoverNationRelationDistribution({
			hoverNationId: 0,
			adjOffset,
			adjList,
			nationCounts,
			relationAt: (_, b) => (b === 1 ? REL.WAR : REL.NEUTRAL),
		})
		const byLabel = Object.fromEntries(result.map((b) => [b.label, b.count]))
		expect(byLabel["War"]).toBe(1)
		expect(byLabel["Neutral"]).toBe(1)
	})

	it("returns empty when hoverNationId is out of adjOffset bounds", () => {
		const result = buildHoverNationRelationDistribution({
			hoverNationId: 5,
			adjOffset: new Int32Array([0, 1]),
			adjList: new Int32Array([1]),
			nationCounts: new Map([[1, 1]]),
			relationAt: () => REL.ALLY,
		})
		expect(result).toEqual([])
	})
})

describe("getHoverTradeGood", () => {
	it("returns null when world has no trade goods", () => {
		const result = getHoverTradeGood({ region: 0 } as never, makeWorld({}))
		expect(result).toBeNull()
	})

	it("returns null for an unassigned location", () => {
		const world = makeWorld({
			tradeGoods: new Uint8Array([0]),
			locations: { regionLocation: new Int32Array([0]) },
		})
		expect(getHoverTradeGood({ region: 0 } as never, world)).toBeNull()
	})

	it("returns lowercase name without goods_ prefix", () => {
		const world = makeWorld({
			tradeGoods: new Uint8Array([1]),
			locations: { regionLocation: new Int32Array([0]) },
		})
		const result = getHoverTradeGood({ region: 0 } as never, world)
		expect(result).not.toBeNull()
		expect(result?.name).toBe("alum")
		expect(result?.materialIndex).toBe(1)
	})
})
