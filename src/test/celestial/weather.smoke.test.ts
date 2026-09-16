import { describe, expect, it } from "vitest"
import { WEATHER } from "@/model/celestial/planet/weather"

const EARTH_DIAMETER_KM = 12_742
const EARTH_TOTAL_HEATING = 81

function defaultParams(
	overrides: Partial<Parameters<typeof WEATHER.computeProfile>[0]>,
) {
	return {
		pressureBar: 1,
		siderealDayHours: 24,
		axialTiltDeg: 0,
		orbitalPeriodDays: 365,
		eccentricity: 0,
		diameterKm: EARTH_DIAMETER_KM,
		group: "terrestrial" as const,
		orbitalDistanceAU: 1,
		luminositySol: 1,
		totalHeating: EARTH_TOTAL_HEATING,
		...overrides,
	}
}

describe("WEATHER.computeProfile stormHazard", () => {
	it("is false with no atmosphere, regardless of tilt/eccentricity", () => {
		const weather = WEATHER.computeProfile(
			defaultParams({ pressureBar: 0, axialTiltDeg: 90, eccentricity: 0.9 }),
		)
		expect(weather.stormHazard).toBe(false)
	})

	it("is false with a real atmosphere but no tilt/eccentricity trigger", () => {
		const weather = WEATHER.computeProfile(defaultParams({}))
		expect(weather.stormHazard).toBe(false)
	})

	it("is true with a thick atmosphere, fast rotation, and strong tilt", () => {
		const weather = WEATHER.computeProfile(defaultParams({ axialTiltDeg: 90 }))
		expect(weather.stormHazard).toBe(true)
	})

	it("is false for a slow/tidally-locked rotator even with a strong tilt trigger", () => {
		const weather = WEATHER.computeProfile(
			defaultParams({ axialTiltDeg: 90, siderealDayHours: 5000 }),
		)
		expect(weather.stormHazard).toBe(false)
	})

	it("eccentricity alone can trigger a storm without any axial tilt", () => {
		const weather = WEATHER.computeProfile(defaultParams({ eccentricity: 0.7 }))
		expect(weather.stormHazard).toBe(true)
	})

	it("real Earth (23.5 deg tilt, 0.0167 eccentricity, 1 bar, ~24h day) does not register as a storm hazard", () => {
		const weather = WEATHER.computeProfile(
			defaultParams({
				siderealDayHours: 23.93447232,
				axialTiltDeg: 23.5,
				orbitalPeriodDays: 365.25,
				eccentricity: 0.0167,
			}),
		)
		expect(weather.stormHazard).toBe(false)
	})
})

describe("WEATHER.computeProfile windSpeedKmh/windForce", () => {
	it("real Earth resolves to its own ~10 km/h baseline", () => {
		const weather = WEATHER.computeProfile(
			defaultParams({ siderealDayHours: 23.93447232 }),
		)
		expect(weather.windSpeedRelative).toBeCloseTo(1, 1)
		expect(weather.windSpeedKmh).toBeCloseTo(10, 0)
	})

	it("a thin/no atmosphere gates windForce toward zero even with high speed inputs", () => {
		const weather = WEATHER.computeProfile(
			defaultParams({ pressureBar: 0.006, diameterKm: 6_779 }), // Mars-like
		)
		expect(weather.windForce).toBeLessThan(0.01)
	})

	it("a real thin atmosphere (Mars-like) still carries meaningful wind speed", () => {
		const weather = WEATHER.computeProfile(
			defaultParams({ pressureBar: 0.006, diameterKm: 6_779 }), // Mars-like
		)
		expect(weather.windSpeedKmh).toBeGreaterThan(5)
	})

	it("true vacuum (real Moon: 0 bar) has zero wind speed, not just zero force", () => {
		const weather = WEATHER.computeProfile(
			defaultParams({
				pressureBar: 0,
				diameterKm: 3_474,
				siderealDayHours: 27.3 * 24,
			}),
		)
		expect(weather.windSpeedRelative).toBe(0)
		expect(weather.windSpeedKmh).toBe(0)
	})

	it("strongWinds crosses the real Gale threshold (~62 km/h) but not below it", () => {
		const calm = WEATHER.computeProfile(defaultParams({}))
		expect(calm.windSpeedKmh).toBeLessThan(62)
		expect(calm.strongWinds).toBe(false)

		const windy = WEATHER.computeProfile(
			defaultParams({ totalHeating: 50_000 }),
		)
		expect(windy.windSpeedKmh).toBeGreaterThan(62)
		expect(windy.strongWinds).toBe(true)
	})

	it("a jovian gets no strongWinds flag at all (always extreme by real-world standards)", () => {
		const weather = WEATHER.computeProfile(
			defaultParams({
				group: "jovian",
				pressureBar: 4200,
				diameterKm: 142_984,
				siderealDayHours: 9.92496,
				orbitalDistanceAU: 5.2,
			}),
		)
		expect(weather.strongWinds).toBeUndefined()
	})

	it("a jovian gets no windForce at all (no solid surface)", () => {
		const weather = WEATHER.computeProfile(
			defaultParams({
				group: "jovian",
				pressureBar: 4200,
				diameterKm: 142_984,
				siderealDayHours: 9.92496,
				orbitalDistanceAU: 5.2,
			}),
		)
		expect(weather.windForce).toBeUndefined()
	})

	it("Neptune ends up windier than Jupiter despite being smaller (insolation-driven heat boost)", () => {
		const jupiter = WEATHER.computeProfile(
			defaultParams({
				group: "jovian",
				pressureBar: 4200,
				diameterKm: 142_984,
				siderealDayHours: 9.92496,
				orbitalDistanceAU: 5.2,
			}),
		)
		const neptune = WEATHER.computeProfile(
			defaultParams({
				group: "jovian",
				pressureBar: 1500,
				diameterKm: 49_244,
				siderealDayHours: 16.11,
				orbitalDistanceAU: 30.05,
			}),
		)
		expect(neptune.windSpeedKmh).toBeGreaterThan(jupiter.windSpeedKmh)
	})

	it("a highly internally-heated non-jovian body (Io-analog) gets a wind-speed boost over an otherwise-identical cold one", () => {
		const cold = WEATHER.computeProfile(defaultParams({ totalHeating: 10 }))
		const ioAnalog = WEATHER.computeProfile(
			defaultParams({ totalHeating: 5000 }),
		)
		expect(ioAnalog.windSpeedKmh).toBeGreaterThan(cold.windSpeedKmh)
	})
})
