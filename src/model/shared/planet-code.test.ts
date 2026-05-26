import { describe, expect, it } from "vitest"
import {
	decodePlanetCode,
	decodePlanetSeed,
	encodePlanetCode,
	SEED_MAX,
} from "./planet-code"

function makeParams(overrides: Record<string, number | boolean> = {}) {
	return {
		seed: 12345,
		numPoints: 204000,
		jitter: 0.75,
		numPlates: 80,
		landDistribution: 0.25,
		continentSizeVariety: 0.35,
		landCoverage: 0.3,
		roughness: 0.4,
		planetRadiusKm: 6371,
		obliquity: 23.5,
		eccentricity: 0.0167,
		sunTempFactor: 1,
		insolationFactor: 1,
		daysPerYear: 365,
		hoursPerDay: 24,
		terrainWarp: 0.75,
		smoothing: 0.1,
		hydraulicErosion: 0.5,
		thermalErosion: 0.1,
		ridgeSharpening: 0.5,
		glacialErosion: 0.5,
		seaLevel: 1,
		volcanism: 0.5,
		craters: 0,
		pressure: 1,
		antistellarLon: 180,
		perihelion: 90,
		tidallyLocked: false,
		...overrides,
	}
}

describe("planet-code format", () => {
	it("encodes seed and params as separate parts", () => {
		const seed = 12345
		const code = encodePlanetCode(seed, makeParams({ seed }))

		const parts = code.split(".")

		expect(parts).toHaveLength(2)
		expect(parts[0]).toBe(seed.toString(36))
		expect(parts[1]).toMatch(/^[0-9a-z]+$/)
	})

	it("recovers the seed even when the params blob is unreadable", () => {
		const seed = 12345
		const code = `${seed.toString(36)}.future-format`

		expect(decodePlanetSeed(code)).toBe(seed)
		expect(decodePlanetCode(code)).toBeNull()
	})
})

describe("planet-code pressure", () => {
	it("round-trips high pressure values up to 100 bar", () => {
		const code = encodePlanetCode(12345, makeParams({ pressure: 100 }))

		expect(decodePlanetCode(code)?.pressure).toBe(100)
	})
})

describe("planet-code year length", () => {
	it("round-trips year lengths up to 4 Earth years", () => {
		const code = encodePlanetCode(12345, makeParams({ daysPerYear: 1460 }))

		expect(decodePlanetCode(code)?.daysPerYear).toBe(1460)
	})
})

describe("planet-code volcanism", () => {
	it("round-trips volcanism values up to the new 10.0 cap", () => {
		const code = encodePlanetCode(12345, makeParams({ volcanism: 10 }))

		expect(decodePlanetCode(code)?.volcanism).toBe(10)
	})
})

describe("planet-code sea level", () => {
	it("round-trips sea level modifiers across the full slider range", () => {
		const code = encodePlanetCode(12345, makeParams({ seaLevel: 1.73 }))

		expect(decodePlanetCode(code)?.seaLevel).toBe(1.73)
	})
})

describe("planet-code seed support", () => {
	it("round-trips large seeds up to the new cap", () => {
		const seed = 587812025
		const code = encodePlanetCode(
			seed,
			makeParams({
				seed,
				numPoints: 578000,
				jitter: 0.55,
				numPlates: 99,
				continentSizeVariety: 0.05,
				landCoverage: 0.51,
				roughness: 0.17,
				planetRadiusKm: 22900,
				obliquity: 148.5,
				eccentricity: 0.414,
				sunTempFactor: 1.01,
				daysPerYear: 505,
				hoursPerDay: 198,
				terrainWarp: 0.05,
				smoothing: 0.85,
				hydraulicErosion: 0.35,
				thermalErosion: 0.7,
				ridgeSharpening: 0.3,
				glacialErosion: 0.65,
				volcanism: 1,
				antistellarLon: 358,
				perihelion: 298,
			}),
		)

		expect(code).toMatch(/^[0-9a-z]+\.[0-9a-z]+$/)
		expect(decodePlanetCode(code)?.seed).toBe(seed)
	})

	it("keeps the seed recoverable if the params segment becomes invalid", () => {
		const seed = SEED_MAX - 1
		const code = `${seed.toString(36)}.future_params_blob`

		expect(decodePlanetSeed(code)).toBe(seed)
		expect(decodePlanetCode(code)).toBeNull()
	})
})

describe("planet-code validation", () => {
	it("rejects malformed separators and invalid seed characters", () => {
		expect(decodePlanetSeed("")).toBeNull()
		expect(decodePlanetSeed("abc")).toBeNull()
		expect(decodePlanetSeed("ab..cd")).toBeNull()
		expect(decodePlanetSeed("ab!.cd")).toBeNull()
	})

	it("clamps pressure, volcanism, craters, and tectonic mode during round-trips", () => {
		const code = encodePlanetCode(
			12345,
			makeParams({
				pressure: -2,
				volcanism: 99,
				craters: 2,
			}),
		)

		expect(decodePlanetCode(code)).toMatchObject({
			pressure: 0.1,
			volcanism: 10,
			craters: 1,
		})
	})

	it("uses default pressure and omits zero craters for non-finite inputs", () => {
		const code = encodePlanetCode(
			12345,
			makeParams({
				pressure: Number.NaN,
				craters: Number.NaN,
			}),
		)

		expect(decodePlanetCode(code)).toMatchObject({
			pressure: 1,
			craters: undefined,
		})
	})

	it("rejects params segments that are too long or contain invalid characters", () => {
		const seedPart = (SEED_MAX - 1).toString(36)

		expect(decodePlanetCode(`${seedPart}.${"z".repeat(64)}`)).toBeNull()
		expect(decodePlanetCode(`${seedPart}.bad-segment`)).toBeNull()
	})
})
