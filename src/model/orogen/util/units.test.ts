import { describe, expect, it } from "vitest"
import {
	DEFAULT_PLANET_RADIUS_KM,
	getEffectiveObliquityDeg,
	getMaxElevationKm,
	getMaxOceanDepthKm,
	getSubstellarDir,
	isRetrogradeObliquity,
	meanEdgeLengthKm,
} from "./units"

describe("getMaxElevationKm", () => {
	it("returnsSixKmAtEarthRadius", () => {
		expect(getMaxElevationKm(DEFAULT_PLANET_RADIUS_KM)).toBeCloseTo(6, 5)
	})

	it("clampsToFifteenKmForTinyPlanets", () => {
		expect(getMaxElevationKm(500)).toBe(15)
	})

	it("clampsToThreeKmForHugePlanets", () => {
		expect(getMaxElevationKm(100_000)).toBe(3)
	})
})

describe("getMaxOceanDepthKm", () => {
	it("returnsTenKmAtEarthRadius", () => {
		expect(getMaxOceanDepthKm(DEFAULT_PLANET_RADIUS_KM)).toBeCloseTo(10, 5)
	})

	it("producesGreaterDepthForLargerPlanets", () => {
		const earth = getMaxOceanDepthKm(DEFAULT_PLANET_RADIUS_KM)
		const larger = getMaxOceanDepthKm(DEFAULT_PLANET_RADIUS_KM * 2)
		expect(larger).toBeGreaterThan(earth)
	})
})

describe("getEffectiveObliquityDeg", () => {
	it("returnsInputWhenBelowNinety", () => {
		expect(getEffectiveObliquityDeg(23.5)).toBe(23.5)
	})

	it("foldsRetrogradeToPrograde", () => {
		expect(getEffectiveObliquityDeg(170)).toBe(10)
	})
})

describe("isRetrogradeObliquity", () => {
	it("returnsFalseForPrograde", () => {
		expect(isRetrogradeObliquity(45)).toBe(false)
	})

	it("returnsTrueForRetrograde", () => {
		expect(isRetrogradeObliquity(120)).toBe(true)
	})
})

describe("getSubstellarDir", () => {
	it("returnsUnitLengthVector", () => {
		const [x, y, z] = getSubstellarDir(42)
		expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6)
	})

	it("producesZeroZComponentAtEquatorialSubstellarPoint", () => {
		const [, , z] = getSubstellarDir(123)
		expect(z).toBe(0)
	})

	it("pointsToLonZeroWhenAntistellarIsOneEighty", () => {
		const [x, y] = getSubstellarDir(180)
		expect(x).toBeCloseTo(1, 6)
		expect(y).toBeCloseTo(0, 6)
	})
})

describe("meanEdgeLengthKm", () => {
	it("fallsBackToAnalyticalEstimateWhenNeighborDistMissing", () => {
		const meshStub = { numRegions: 10_000 }
		const result = meanEdgeLengthKm(meshStub, DEFAULT_PLANET_RADIUS_KM)
		expect(result).toBeGreaterThan(0)
		expect(Number.isFinite(result)).toBe(true)
	})

	it("usesNeighborDistWhenProvided", () => {
		const meshStub = {
			numRegions: 4,
			neighborDist: new Float32Array([0.1, 0.1, 0.1, 0.1]),
		}
		const result = meanEdgeLengthKm(meshStub, 1000)
		expect(result).toBeCloseTo(100, 5)
	})
})
