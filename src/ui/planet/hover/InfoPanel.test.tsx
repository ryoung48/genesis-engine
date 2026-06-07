import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
	CULTURE_GENDER_SYSTEM,
	leaderGenderSymbol,
	resolveLeaderGender,
} from "@/model/society/gender-system"
import {
	packRoutes as packRouteData,
	ROUTE_LAND_MAJOR,
	ROUTE_LAND_MINOR,
	ROUTE_SEA,
	type SerializedOrogenWorld,
} from "@/model/transport/worker-types"
import { InfoPanel } from "./InfoPanel"

function makeWorld(): SerializedOrogenWorld {
	return {
		mesh: { numRegions: 1 },
		params: { planetRadiusKm: 6371 },
		climate: {
			temperature_avg: new Float32Array([12]),
			temperature_monthly: new Float32Array(
				Array.from({ length: 12 }, () => 12),
			),
			daylight_hours_monthly: new Float32Array(
				Array.from({ length: 12 }, () => 10),
			),
			pet_monthly: new Float32Array(Array.from({ length: 12 }, () => 5)),
		},
		rainfall: {
			annual: new Float32Array([240]),
			monthly: new Float32Array(Array.from({ length: 12 }, () => 20)),
		},
		hydrology: {
			aet_monthly: new Float32Array(Array.from({ length: 12 }, () => 4)),
		},
		isLand: new Uint8Array([1]),
		iceThickness: new Float32Array([0]),
		iceMinMonthly: new Float32Array([0]),
		iceMaxMonthly: new Float32Array([0]),
		slopeScore: new Float32Array([0.2]),
		climateZones: new Uint8Array([1]),
		vegetation: new Uint8Array([1]),
		topography: new Uint8Array([1]),
		pastaClimate: new Uint8Array([1]),
		pastaDebug: {
			gdd_monthly: new Float32Array(Array.from({ length: 12 }, () => 100)),
			gint_monthly: new Float32Array(Array.from({ length: 12 }, () => 2)),
			gdd: new Float32Array([1200]),
			gint: new Float32Array([8]),
			minT: new Float32Array([2]),
			maxT: new Float32Array([24]),
		},
		provinces: {
			desolate: new Uint8Array([0]),
			size: new Float32Array([1]),
			colors: new Float32Array([1, 0, 0]),
		},
		leaderNameSeed: new Int32Array([-1, -1, 99]),
		leaderBirthYear: new Float32Array([-1, -1, 0]),
		leaderDynasty: new Int32Array([-1, -1, 6]),
		nations: {
			assignment: new Int32Array([2]),
			gravity: new Float32Array([4]),
		},
		population: {
			habitability: new Float32Array([7.25]),
			population: new Float32Array([120000]),
		},
		urbanPopulation: new Float32Array([42000]),
		development: new Float32Array([0.75]),
		cultures: {
			assignment: new Int32Array([1, 1, 1]),
			colors: new Float32Array([1, 0, 0, 0, 1, 0]),
			genderSystems: new Uint8Array([
				CULTURE_GENDER_SYSTEM.PATRIARCHAL,
				CULTURE_GENDER_SYSTEM.PATRIARCHAL,
			]),
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
		landmarks: {
			regionLandmark: new Int32Array([3]),
			type: new Uint8Array([0, 0, 0, 3, 4, 5]),
			size: new Int32Array([1, 1, 1, 1, 1, 1]),
			count: 6,
		},
		settlementWaterLandmarks: new Int32Array([4]),
		settlementPortRegions: new Int32Array([0]),
	} as unknown as SerializedOrogenWorld
}

function makeInlandWorld(): SerializedOrogenWorld {
	return {
		...makeWorld(),
		settlementWaterLandmarks: new Int32Array([-1]),
		settlementPortRegions: new Int32Array([-1]),
	} as SerializedOrogenWorld
}

function packRoutes(routes: Parameters<typeof packRouteData>[0]) {
	return packRouteData(routes)
}

function renderPanel(
	overrides: Partial<React.ComponentProps<typeof InfoPanel>> = {},
) {
	return renderToStaticMarkup(
		<InfoPanel
			hoverInfo={{ region: 0, x: 0, y: 0 }}
			hoverElevationKm={1.5}
			hoverTopography="Plateau"
			hoverCoordinates="10.0N, 20.0E"
			hoverTimezone="UTC+1"
			hoverLandmark={{ id: 3, type: "peak", size: 1 }}
			hoverIsLand={true}
			hoverTemperatureDelta={6}
			hoverRainfall={20}
			hoverDtr={{
				value: 5,
				annual: 5,
				monthly: Array.from({ length: 12 }, () => 5),
			}}
			hoverHumidity={{
				value: 60,
				annual: 60,
				monthly: Array.from({ length: 12 }, () => 60),
			}}
			hoverClimateDisplay="Temperate"
			hoverIceSummary={null}
			hoverBiome="Forest"
			hoverProvince={0}
			hoverNationId={2}
			hoverOccupation={{
				id: 9,
				name: "Invaders",
				color: "rgb(1,2,3)",
				rebel: false,
			}}
			hoverOceanDist={25}
			hoverDistCoast={1}
			hoverDistCoastKm={12}
			hoverHazards={{
				earthquake: 0.3,
				volcano: 0.1,
				danger: 0.3,
				cyclone: 0,
				tornado: 0,
				tidal: 0,
			}}
			hoverHotspot={null}
			hoverRiver={null}
			hoverTerrainFeature={{ dominant: "ridge", all: ["ridge"] }}
			hoverOceanCurrents={null}
			hoverWindSpeed={null}
			hoverWindDir={null}
			hoverWindMonthly={null}
			showOceanCurrentOverlay={false}
			colorMode="terrain"
			populationMode="density"
			selectedTimeMs={800}
			displayMonth={1}
			climateTimeMode="current"
			climateMonth={0}
			unitSystem="metric"
			world={makeWorld()}
			routes={packRoutes([
				{
					fromProvince: 0,
					toProvince: 1,
					kind: ROUTE_LAND_MAJOR,
					pathRegions: [0, 1],
				},
			])}
			hoverCardRef={{ current: null }}
			getProvinceName={(id) => `Province ${id}`}
			getNationName={(id) => `Nation ${id}`}
			getLeaderName={(id, timeMs) => `Leader ${id}@${timeMs}`}
			getDynastyName={(id) => `Dynasty ${id}`}
			getCultureName={(id) => `Culture ${id}`}
			getHeritageName={(id) => `Heritage ${id}`}
			getFaithName={(id) => `Faith ${id}`}
			getReligionName={(id) => `Religion ${id}`}
			getLandmarkName={(id) => `Landform ${id}`}
			getRiverName={(id) => `River Name ${id}`}
			{...overrides}
		/>,
	)
}

const expectedRulerSymbol = leaderGenderSymbol(
	resolveLeaderGender(CULTURE_GENDER_SYSTEM.PATRIARCHAL, 99),
)

describe("InfoPanel", () => {
	it("shows only geography-focused hover data for geography modes", () => {
		const markup = renderPanel()

		expect(markup).toContain(">Elev<")
		expect(markup).toContain(">Peak<")
		expect(markup).toContain("Landform 3 (100.0%)")
		expect(markup).toContain(">Climate<")
		expect(markup).toContain(">Route<")
		expect(markup).toContain(">Major<")
		expect(markup).toContain(">Veg<")
		expect(markup).not.toContain(">Province<")
		expect(markup).not.toContain(">Nation<")
		expect(markup).not.toContain(">Population<")
	})

	it("shows sea route presence in geography mode", () => {
		const markup = renderPanel({
			routes: packRoutes([
				{
					fromProvince: 0,
					toProvince: 1,
					kind: ROUTE_SEA,
					pathRegions: [0, 1],
				},
			]),
		})

		expect(markup).toContain(">Route<")
		expect(markup).toContain(">Sea<")
	})

	it("shows minor road presence in geography mode", () => {
		const markup = renderPanel({
			routes: packRoutes([
				{
					fromProvince: 0,
					toProvince: 1,
					kind: ROUTE_LAND_MINOR,
					pathRegions: [0, 1],
				},
			]),
		})

		expect(markup).toContain(">Route<")
		expect(markup).toContain(">Minor<")
	})

	it("shows port water body details in demographics mode", () => {
		const markup = renderPanel({
			colorMode: "population",
			world: makeWorld(),
		})

		expect(markup).toContain(">Port<")
		expect(markup).toContain("Landform 4 (Sea)")
	})

	it("omits port details in demographics mode when no port exists", () => {
		const markup = renderPanel({
			colorMode: "population",
			world: makeInlandWorld(),
		})

		expect(markup).not.toContain(">Port<")
	})

	it("renders geography-only feature and temperature detail branches", () => {
		const markup = renderPanel({
			colorMode: "terrainFeatures",
			hoverIceSummary: "0.20 m",
		})

		expect(markup).toContain(">Features<")
		expect(markup).not.toContain(">Ice<")
		expect(markup).not.toContain(">Danger<")
		expect(markup).toContain(">Ocean dist<")
		expect(markup).toContain(">Coast dist<")
	})

	it("shows danger details only in danger mode", () => {
		const markup = renderPanel({
			colorMode: "dangerZones",
			hoverHazards: {
				earthquake: 0.1,
				volcano: 0.3,
				danger: 0.25,
				cyclone: 0,
				tornado: 0,
				tidal: 0,
			},
			dangerSubMode: "volcanic",
		})

		expect(markup).toContain(">Volcanic<")
		expect(markup).toContain(">30%<")
	})

	it("shows quake-tagged danger when earthquakes dominate", () => {
		const markup = renderPanel({
			colorMode: "dangerZones",
			hoverHazards: {
				earthquake: 0.35,
				volcano: 0.1,
				danger: 0.25,
				cyclone: 0,
				tornado: 0,
				tidal: 0,
			},
			dangerSubMode: "earthquake",
		})

		expect(markup).toContain(">Earthquake<")
		expect(markup).toContain(">35%<")
		expect(markup).not.toContain("(volcanic)")
	})

	it("renders DTR, precipitation, river, pasta, and ocean-current charts for geography debug modes", () => {
		const dtrMarkup = renderPanel({
			colorMode: "dtr",
		})
		const precipitationMarkup = renderPanel({
			colorMode: "precipitation",
			showPet: true,
			showAet: true,
			showRivers: true,
			hoverRiver: {
				flow: 12,
				flow_monthly: Array.from({ length: 12 }, () => 12),
				riverId: 7,
				lengthKm: 30,
			},
		})
		const pastaMarkup = renderPanel({
			colorMode: "pastaClimate",
			showGdd: true,
			showGint: true,
		})
		const currentMarkup = renderPanel({
			colorMode: "oceanCurrents",
			hoverOceanCurrents: {
				warmth: 0.8,
				delta: 1.5,
				averageDelta: 1.2,
				mode: "warm",
				monthlyDelta: Array.from({ length: 12 }, () => 1.2),
			},
		})

		expect(dtrMarkup).toContain(">DTR<")
		expect(precipitationMarkup).toContain(">PET<")
		expect(precipitationMarkup).toContain(">AET<")
		expect(precipitationMarkup).toContain("River Name 7")
		expect(precipitationMarkup).toContain("Length")
		expect(pastaMarkup).toContain(">GDD<")
		expect(pastaMarkup).toContain(">GInt<")
		expect(pastaMarkup).toContain("MIN")
		expect(pastaMarkup).toContain("MAX")
		expect(currentMarkup).toContain("Ocean Current")
		expect(currentMarkup).toContain("warm")
	})

	it("shows ocean current details when the current overlay is enabled", () => {
		const currentMarkup = renderPanel({
			colorMode: "terrain",
			showOceanCurrentOverlay: true,
			hoverOceanCurrents: {
				warmth: 0.4,
				delta: 1.5,
				averageDelta: 1.5,
				mode: "warm",
				monthlyDelta: Array.from({ length: 12 }, () => 1.5),
			},
		})

		expect(currentMarkup).toContain("Ocean Current")
		expect(currentMarkup).toContain("warm")
	})

	it("shows ice only in pasta climate mode", () => {
		const pastaMarkup = renderPanel({
			colorMode: "pastaClimate",
			hoverIceSummary: "0.20 m",
		})
		const terrainMarkup = renderPanel({
			colorMode: "terrain",
			hoverIceSummary: "0.20 m",
		})

		expect(pastaMarkup).toContain(">Ice<")
		expect(terrainMarkup).not.toContain(">Ice<")
	})

	it("renders geography edge cases without leaking political or demographic rows", () => {
		const markup = renderPanel({
			colorMode: "temperatureDelta",
			hoverLandmark: { id: 4, type: null, size: null },
			hoverHazards: {
				earthquake: 0.1,
				volcano: 0.3,
				danger: 0.25,
				cyclone: 0,
				tornado: 0,
				tidal: 0,
			},
			hoverOceanDist: 0,
			hoverDistCoastKm: Infinity,
			hoverTopography: null,
			hoverClimateDisplay: null,
			hoverBiome: null,
		})

		expect(markup).toContain(">Temp Δ<")
		expect(markup).toContain(">Landmark<")
		expect(markup).toContain("Landform 4")
		expect(markup).not.toContain("(volcanic)")
		expect(markup).toContain(">∞<")
		expect(markup).not.toContain(">Province<")
		expect(markup).not.toContain(">Development<")
	})

	it("renders geography fallback branches when optional data is missing or over water", () => {
		const markup = renderPanel({
			colorMode: "precipitation",
			world: {
				...makeWorld(),
				isLand: new Uint8Array([0]),
				slopeScore: undefined,
			} as SerializedOrogenWorld,
			hoverLandmark: { id: 5, type: null, size: null },
			hoverHazards: {
				earthquake: 0.1,
				volcano: 0.05,
				danger: 0.1,
				cyclone: 0,
				tornado: 0,
				tidal: 0,
			},
			showRivers: true,
			hoverOceanDist: null,
			hoverDistCoastKm: null,
			hoverTopography: null,
			hoverClimateDisplay: null,
			hoverBiome: null,
			hoverRiver: {
				flow: 5,
				flow_monthly: Array.from({ length: 12 }, () => 5),
				riverId: 2,
				lengthKm: 0,
			},
		})

		expect(markup).toContain(">Elev<")
		expect(markup).toContain(">Landmark<")
		expect(markup).toContain("Landform 5")
		expect(markup).not.toContain("(quakes)")
		expect(markup).not.toContain("(volcanic)")
		expect(markup).toContain(">—<")
		expect(markup).not.toContain(">PET<")
		expect(markup).not.toContain(">AET<")
		expect(markup).not.toContain("Length")
		expect(markup).toContain("River Name 2")
	})

	it("shows precipitation for lake regions while keeping land-only hydrology rows hidden", () => {
		const markup = renderPanel({
			colorMode: "precipitation",
			world: {
				...makeWorld(),
				isLand: new Uint8Array([0]),
				rivers: {
					lakes: new Uint8Array([1]),
				},
			} as SerializedOrogenWorld,
		})

		expect(markup).toContain(">Precip<")
		expect(markup).not.toContain(">PET<")
		expect(markup).not.toContain(">AET<")
	})

	it("shows the average annual precipitation across all regions in a hovered lake", () => {
		const markup = renderPanel({
			world: {
				...makeWorld(),
				mesh: { numRegions: 3 },
				climate: {
					...makeWorld().climate,
					temperature_avg: new Float32Array([12, 12, 12]),
					temperature_monthly: new Float32Array(
						Array.from({ length: 36 }, () => 12),
					),
					daylight_hours_monthly: new Float32Array(
						Array.from({ length: 36 }, () => 10),
					),
					pet_monthly: new Float32Array(Array.from({ length: 36 }, () => 5)),
				},
				rainfall: {
					annual: new Float32Array([150, 300, 900]),
					monthly: new Float32Array(Array.from({ length: 36 }, () => 20)),
				},
				landmarks: {
					regionLandmark: new Int32Array([5, 5, 3]),
					type: new Uint8Array([0, 0, 0, 3, 4, 5]),
					size: new Int32Array([1, 1, 1, 1, 1, 2]),
					count: 6,
				},
			} as SerializedOrogenWorld,
			hoverInfo: { region: 0, x: 0, y: 0 },
			hoverLandmark: { id: 5, type: "lake", size: 2 },
		})

		expect(markup).toContain(">Lake Avg Rain<")
		expect(markup).toContain(">225 mm<")
	})

	it("renders infinite pasta summaries and cold current deltas", () => {
		const pastaMarkup = renderPanel({
			colorMode: "pastaClimate",
			showGdd: true,
			world: {
				...makeWorld(),
				pastaDebug: {
					...makeWorld().pastaDebug,
					gdd: new Float32Array([99999]),
					gint: new Float32Array([99999]),
				},
			} as SerializedOrogenWorld,
		})
		const currentMarkup = renderPanel({
			colorMode: "oceanCurrents",
			hoverOceanCurrents: {
				warmth: -0.8,
				delta: -1.5,
				averageDelta: -1.2,
				mode: "cold",
				monthlyDelta: Array.from({ length: 12 }, () => -1.2),
			},
		})

		expect(pastaMarkup).toContain(">∞<")
		expect(currentMarkup).toContain("cold")
		expect(currentMarkup).toContain("avg")
	})

	it("shows only political hover data for political modes", () => {
		const markup = renderPanel({
			colorMode: "nations",
		})

		expect(markup).toContain(">Province<")
		expect(markup).toContain("Province 0")
		expect(markup).toContain(">Nation<")
		expect(markup).toContain(">Dynasty<")
		expect(markup).toContain("Dynasty 6")
		expect(markup).toContain(">Ruler<")
		expect(markup).toContain(`Leader 2@800 · ${expectedRulerSymbol} · 0`)
		expect(markup).toContain(">Occupier<")
		expect(markup).not.toContain(">Elev<")
		expect(markup).not.toContain(">Climate<")
		expect(markup).not.toContain(">Population<")
	})

	it("falls back to province ids when no province naming callback is provided", () => {
		const markup = renderPanel({
			colorMode: "nations",
			getProvinceName: undefined,
		})

		expect(markup).toContain("#0")
	})

	it("renders rebel occupiers in political mode", () => {
		const markup = renderPanel({
			colorMode: "nations",
			hoverNationId: 1,
			hoverOccupation: {
				id: 9,
				name: "Invaders",
				color: "rgb(0, 0, 0)",
				rebel: true,
			},
		})

		expect(markup).toContain("Nation 1")
		expect(markup).toContain("Invaders (rebels)")
		expect(markup).toContain("background-color:rgb(0, 0, 0)")
		expect(markup).not.toContain("repeating-linear-gradient")
	})

	it("shows dynasty without ruler details when no selected time is available", () => {
		const markup = renderPanel({
			colorMode: "nations",
			selectedTimeMs: null,
		})

		expect(markup).toContain(">Dynasty<")
		expect(markup).toContain("Dynasty 6")
		expect(markup).not.toContain(">Ruler<")
	})

	it("shows a ruler without dynasty text when no dynasty can be resolved", () => {
		const markup = renderPanel({
			colorMode: "nations",
			world: {
				...makeWorld(),
				leaderDynasty: new Int32Array([-1, -1, -1]),
			} as SerializedOrogenWorld,
			hoverOccupation: null,
		})

		expect(markup).toContain(">Ruler<")
		expect(markup).toContain(`Leader 2@800 · ${expectedRulerSymbol} · 0`)
		expect(markup).not.toContain(">Dynasty<")
		expect(markup).not.toContain(">Occupier<")
	})

	it("omits dynasty and ruler rows when the naming resolvers are unavailable", () => {
		const markup = renderPanel({
			colorMode: "nations",
			getLeaderName: undefined,
			getDynastyName: undefined,
		})

		expect(markup).not.toContain(">Dynasty<")
		expect(markup).not.toContain(">Ruler<")
	})

	it("omits political detail rows when no valid province is hovered", () => {
		const markup = renderPanel({
			colorMode: "nations",
			hoverProvince: -1,
			hoverNationId: null,
			hoverOccupation: null,
		})

		expect(markup).toContain(">Coords<")
		expect(markup).not.toContain(">Province<")
		expect(markup).not.toContain(">Nation<")
		expect(markup).not.toContain(">Occupier<")
	})

	it("renders the full demographic summary without political rows", () => {
		const markup = renderPanel({
			colorMode: "population",
			populationMode: "development",
		})

		expect(markup).toContain(">Population<")
		expect(markup).toContain(">120K")
		expect(markup).toContain(">Habitability<")
		expect(markup).toContain(">7.25<")
		expect(markup).toContain(">Development<")
		expect(markup).toContain(">0.75<")
		expect(markup).toContain(">Urban Pop<")
		expect(markup).toContain(">42,000<")
		expect(markup).toContain(">Culture<")
		expect(markup).toContain(">Heritage<")
		expect(markup).toContain(">Faith<")
		expect(markup).toContain(">Religion<")
		expect(markup).not.toContain(">Province<")
	})

	it("keeps habitability directly below population in demographics mode", () => {
		const markup = renderPanel({
			colorMode: "population",
			populationMode: "density",
		})

		expect(markup.indexOf(">Population<")).toBeLessThan(
			markup.indexOf(">Habitability<"),
		)
		expect(markup.indexOf(">Habitability<")).toBeLessThan(
			markup.indexOf(">Urban Pop<"),
		)
	})

	it("omits demographic detail rows when no valid province is hovered", () => {
		const markup = renderPanel({
			colorMode: "population",
			populationMode: "faith",
			hoverProvince: -1,
		})

		expect(markup).toContain(">Coords<")
		expect(markup).not.toContain(">Faith<")
		expect(markup).not.toContain(">Province<")
	})

	it("keeps the selected demographic first while still showing the related rows", () => {
		const markup = renderPanel({
			colorMode: "population",
			populationMode: "culture",
		})

		expect(markup.indexOf(">Culture<")).toBeLessThan(
			markup.indexOf(">Population<"),
		)
		expect(markup).toContain(">Culture<")
		expect(markup).toContain(">Culture 1<")
		expect(markup).toContain(">Development<")
		expect(markup).toContain(">Religion<")
		expect(markup).not.toContain(">Province<")
		expect(markup).not.toContain(">Nation<")
		expect(markup).not.toContain(">Elev<")
	})

	it("prioritizes belief demographics when religion mode is selected", () => {
		const markup = renderPanel({
			colorMode: "population",
			populationMode: "religion",
		})

		expect(markup.indexOf(">Faith<")).toBeLessThan(
			markup.indexOf(">Population<"),
		)
		expect(markup.indexOf(">Religion<")).toBeLessThan(
			markup.indexOf(">Population<"),
		)
	})

	it("skips current and river charts when the inputs have no meaningful signal", () => {
		const currentMarkup = renderPanel({
			colorMode: "oceanCurrents",
			hoverOceanCurrents: {
				warmth: 0.2,
				delta: 0,
				averageDelta: 0,
				mode: "warm",
				monthlyDelta: Array.from({ length: 12 }, () => 0),
			},
		})
		const riverMarkup = renderPanel({
			colorMode: "precipitation",
			showRivers: true,
			hoverRiver: {
				flow: 12,
				flow_monthly: Array.from({ length: 11 }, () => 12),
				riverId: 7,
				lengthKm: 0,
			},
		})

		expect(currentMarkup).not.toContain("Ocean Current")
		expect(riverMarkup).not.toContain("River #7")
		expect(riverMarkup).not.toContain("Length")
	})

	it("omits the AET chart when all aet values are zero", () => {
		const markup = renderPanel({
			colorMode: "precipitation",
			showPet: true,
			showAet: true,
			world: {
				...makeWorld(),
				hydrology: {
					aet_monthly: new Float32Array(12),
				},
			} as SerializedOrogenWorld,
		})

		expect(markup).toContain(">PET<")
		expect(markup).not.toContain(">AET<")
	})
})
