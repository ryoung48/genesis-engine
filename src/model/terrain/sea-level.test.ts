import { describe, expect, it } from "vitest"
import { elevToHeightKm } from "../climate/climate"
import {
	applySeaLevelToElevation,
	computeSeaLevelOffsetKm,
	heightKmToElev,
} from "./sea-level"

describe("computeSeaLevelOffsetKm", () => {
	it("keeps modifier 1 as an exact no-op", () => {
		expect(computeSeaLevelOffsetKm(1, 10)).toBe(0)
	})

	it("maps lower and higher sea levels against ocean and mountain ranges", () => {
		expect(computeSeaLevelOffsetKm(0, 10)).toBe(-10)
		expect(computeSeaLevelOffsetKm(2, 10)).toBe(10)
		expect(computeSeaLevelOffsetKm(0.5, 10)).toBe(-5)
		expect(computeSeaLevelOffsetKm(1.5, 10)).toBe(5)
	})
})

describe("heightKmToElev", () => {
	it("inverts the normalized elevation model around sea level", () => {
		expect(heightKmToElev(-5, 6, 10)).toBeCloseTo(-0.5, 5)
		expect(heightKmToElev(0, 6, 10)).toBe(0)
		expect(heightKmToElev(6, 6, 10)).toBe(1)
	})
})

describe("applySeaLevelToElevation", () => {
	it("leaves the surface unchanged when sea level is 1", () => {
		const baseElevation = new Float32Array([-0.5, 0, 0.3, 1])
		const result = applySeaLevelToElevation({
			baseElevation,
			maxElevKm: 6,
			maxDepthKm: 10,
			seaLevel: 1,
		})

		expect(result.elevation).toBe(baseElevation)
		for (let i = 0; i < baseElevation.length; i++) {
			expect(result.elevation_km[i]).toBeCloseTo(
				elevToHeightKm(baseElevation[i], 6, 10),
				5,
			)
		}
		expect(result.seaLevelOffsetKm).toBe(0)
	})

	it("raises and lowers the final shoreline in km-space", () => {
		const baseElevation = new Float32Array([-0.2, 0, 0.25])

		const raised = applySeaLevelToElevation({
			baseElevation,
			maxElevKm: 6,
			maxDepthKm: 10,
			seaLevel: 1.5,
		})
		const lowered = applySeaLevelToElevation({
			baseElevation,
			maxElevKm: 6,
			maxDepthKm: 10,
			seaLevel: 0.5,
		})

		expect(raised.elevation_km[0]).toBeCloseTo(
			elevToHeightKm(baseElevation[0], 6, 10) - 5,
			5,
		)
		expect(raised.elevation_km[1]).toBeCloseTo(-5, 5)
		expect(raised.elevation_km[2]).toBeCloseTo(
			elevToHeightKm(baseElevation[2], 6, 10) - 5,
			5,
		)
		expect(raised.elevation[2]).toBeLessThanOrEqual(0)
		expect(lowered.elevation_km[0]).toBeCloseTo(
			elevToHeightKm(baseElevation[0], 6, 10) + 5,
			5,
		)
		expect(lowered.elevation_km[1]).toBeCloseTo(5, 5)
		expect(lowered.elevation_km[2]).toBeCloseTo(
			elevToHeightKm(baseElevation[2], 6, 10) + 5,
			5,
		)
		expect(lowered.elevation[0]).toBeGreaterThan(0)
	})
})
