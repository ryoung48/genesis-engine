import { describe, expect, it } from "vitest"
import { relativeHumidityFromTempRange } from "./humidity"

describe("relativeHumidityFromTempRange", () => {
	it("returns ~100% when there is no diurnal swing (Tmin = Tmean = Tdew)", () => {
		expect(relativeHumidityFromTempRange(20, 0)).toBeCloseTo(100, 5)
	})

	it("decreases monotonically as the diurnal range widens", () => {
		const wet = relativeHumidityFromTempRange(25, 5)
		const mid = relativeHumidityFromTempRange(25, 15)
		const dry = relativeHumidityFromTempRange(25, 30)
		expect(wet).toBeGreaterThan(mid)
		expect(mid).toBeGreaterThan(dry)
	})

	it("matches the Magnus closed form for a known case", () => {
		// Tmean 25°C, DTR 10°C -> Tdew 20°C -> ~73.8% (see analysis table)
		expect(relativeHumidityFromTempRange(25, 10)).toBeCloseTo(73.8, 0)
	})

	it("clamps to the 0–100 range", () => {
		// A range exceeding 2x the mean drives Tdew far below freezing but stays >= 0.
		const rh = relativeHumidityFromTempRange(5, 60)
		expect(rh).toBeGreaterThanOrEqual(0)
		expect(rh).toBeLessThanOrEqual(100)
	})

	it("arid correction lowers RH monotonically as aridity ratio decreases", () => {
		const humid = relativeHumidityFromTempRange(30, 15, 0.9)
		const semiarid = relativeHumidityFromTempRange(30, 15, 0.3)
		const desert = relativeHumidityFromTempRange(30, 15, 0.0)
		expect(humid).toBeGreaterThan(semiarid)
		expect(semiarid).toBeGreaterThan(desert)
	})

	it("arid correction has no effect when aridity >= 0.5", () => {
		const uncorrected = relativeHumidityFromTempRange(25, 10)
		const corrected = relativeHumidityFromTempRange(25, 10, 0.8)
		expect(corrected).toBeCloseTo(uncorrected, 10)
	})

	it("arid correction at ar=0 applies full 2°C dewpoint bias", () => {
		const withoutCorrection = relativeHumidityFromTempRange(25, 10)
		const withCorrection = relativeHumidityFromTempRange(25, 10, 0)
		expect(withCorrection).toBeLessThan(withoutCorrection)
	})
})
