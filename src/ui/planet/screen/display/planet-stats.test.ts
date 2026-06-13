import { describe, expect, it } from "vitest"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import { computePlanetStats } from "./planet-stats"

function buildWorld(): SerializedGenesisWorld {
	const world = {
		mesh: { numRegions: 4 } as SerializedGenesisWorld["mesh"],
		elevation: Float32Array.from([1, 1, -1, -1]),
		params: {
			obliquity: 23.5,
			eccentricity: 0.0167,
			perihelion: 102,
			sunTempFactor: 1,
			daysPerYear: 365,
			hoursPerDay: 24,
			planetRadiusKm: 6371,
			pressure: 1,
			tidallyLocked: false,
		} as SerializedGenesisWorld["params"],
		continentCount: 2,
		climate: {
			temperature_avg: Float32Array.from([10, 14]),
			temperature_min: Float32Array.from([0, 2]),
			temperature_max: Float32Array.from([20, 26]),
		} as SerializedGenesisWorld["climate"],
		rainfall: {
			annual: Float32Array.from([1000, 1200]),
		} as SerializedGenesisWorld["rainfall"],
		dtr_annual: Float32Array.from([8, 10]),
		provinces: { count: 2 } as SerializedGenesisWorld["provinces"],
		locations: { count: 6 } as SerializedGenesisWorld["locations"],
		population: {
			habitabilityScore: 0.75,
			totalPopulation: 2_500_000,
		} as SerializedGenesisWorld["population"],
	} satisfies Partial<SerializedGenesisWorld>

	return world as SerializedGenesisWorld
}

function statValue(
	stats: ReturnType<typeof computePlanetStats>,
	label: string,
): string | undefined {
	return stats.find((stat) => stat.label === label)?.value
}

describe("computePlanetStats", () => {
	it("routes displayed metrics through the shared unit formatters", () => {
		const world = buildWorld()
		const params = {
			obliquity: 10,
			eccentricity: 0.01,
			perihelion: 90,
			antistellarLon: 180,
			sunTempFactor: 1,
			daysPerYear: 365,
			hoursPerDay: 24,
			planetRadiusKm: 6371,
			pressure: 1,
			tidallyLocked: false,
		}

		const metric = computePlanetStats(world, params, "metric")
		const imperial = computePlanetStats(world, params, "imperial")

		expect(statValue(metric, "Avg Temp")).toBe("12.0 °C")
		expect(statValue(imperial, "Avg Temp")).toBe("53.6 °F")
		expect(statValue(metric, "Delta Temp")).toBe("26.0 °C")
		expect(statValue(imperial, "Delta Temp")).toBe("46.8 °F")
		expect(statValue(metric, "Avg Rain")).toBe("1100 mm")
		expect(statValue(imperial, "Avg Rain")).toBe("43.3 in")
		expect(statValue(metric, "Avg Province Area")).toMatch(/k km²$/)
		expect(statValue(imperial, "Avg Province Area")).toMatch(/k mi²$/)
		expect(statValue(metric, "Locations")).toBe("6")
		expect(statValue(imperial, "Locations")).toBe("6")
		expect(statValue(metric, "Avg Location Area")).toMatch(/k km²$/)
		expect(statValue(imperial, "Avg Location Area")).toMatch(/k mi²$/)
		expect(statValue(metric, "Land Area")).toMatch(/M km²$/)
		expect(statValue(imperial, "Land Area")).toMatch(/M mi²$/)
		expect(statValue(metric, "Land Coverage")).toBe("50.0%")
		expect(statValue(imperial, "Land Coverage")).toBe("50.0%")
	})

	it("falls back to params and placeholders when world data is missing", () => {
		const stats = computePlanetStats(
			null,
			{
				obliquity: 10,
				eccentricity: 0.01,
				perihelion: 90,
				antistellarLon: 180,
				sunTempFactor: 1.2,
				daysPerYear: 400,
				hoursPerDay: 30,
				planetRadiusKm: 7000,
				pressure: 1.5,
				tidallyLocked: true,
			},
			"metric",
		)

		expect(statValue(stats, "Lock")).toBe("Tidal")
		expect(statValue(stats, "Tilt")).toBe("10.0 deg")
		expect(statValue(stats, "Year")).toBe("400 d")
		expect(statValue(stats, "Day")).toBe("30.0 h")
		expect(statValue(stats, "Pressure")).toBe("1.5 bar")
		expect(statValue(stats, "Avg Province Area")).toBe("-")
		expect(statValue(stats, "Locations")).toBe("-")
		expect(statValue(stats, "Avg Location Area")).toBe("-")
		expect(statValue(stats, "Cell")).toBe("-")
		expect(statValue(stats, "Land Area")).toBe("-")
		expect(statValue(stats, "Avg Temp")).toBe("-")
		expect(statValue(stats, "Delta Temp")).toBe("-")
		expect(statValue(stats, "Avg Rain")).toBe("-")
		expect(statValue(stats, "Avg DTR")).toBe("-")
	})

	it("prefers active world params over generation params", () => {
		const world = buildWorld()
		world.params = {
			...world.params,
			obliquity: 61,
			perihelion: 135,
			daysPerYear: 420,
			hoursPerDay: 18,
			pressure: 2.2,
			tidallyLocked: true,
		}

		const stats = computePlanetStats(
			world,
			{
				obliquity: 10,
				eccentricity: 0.01,
				perihelion: 90,
				antistellarLon: 180,
				sunTempFactor: 1.2,
				daysPerYear: 400,
				hoursPerDay: 30,
				planetRadiusKm: 7000,
				pressure: 1.5,
				tidallyLocked: false,
			},
			"metric",
		)

		expect(statValue(stats, "Lock")).toBe("Tidal")
		expect(statValue(stats, "Tilt")).toBe("61.0 deg")
		expect(statValue(stats, "Perihelion")).toBe("135 deg")
		expect(statValue(stats, "Year")).toBe("420 d")
		expect(statValue(stats, "Day")).toBe("18.0 h")
		expect(statValue(stats, "Pressure")).toBe("2.2 bar")
	})
})
