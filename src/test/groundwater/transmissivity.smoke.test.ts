import { describe, expect, it } from "vitest"
import { TRANSMISSIVITY } from "@/model/geography/terrain/groundwater/transmissivity"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG

const BASE = {
	logK: -13,
	ksMs: 1e-5,
	soilDepthM: 1,
	slope: 0.02,
	coldest: 5,
}

describe("transmissivity", () => {
	it("equals the closed formula", () => {
		const efold = Math.max(
			C.efoldMinM,
			C.efoldM / (1 + C.efoldSlope * BASE.slope),
		)
		const expected =
			BASE.ksMs * BASE.soilDepthM + 10 ** BASE.logK * C.rhoGOverMu * efold
		expect(TRANSMISSIVITY.at(BASE)).toBeCloseTo(expected, 15)
	})

	it("rises with logK, Ks and soil depth", () => {
		const base = TRANSMISSIVITY.at(BASE)
		expect(TRANSMISSIVITY.at({ ...BASE, logK: -12 })).toBeGreaterThan(base)
		expect(TRANSMISSIVITY.at({ ...BASE, ksMs: 1e-4 })).toBeGreaterThan(base)
		expect(TRANSMISSIVITY.at({ ...BASE, soilDepthM: 2 })).toBeGreaterThan(base)
	})

	it("falls with frost and is monotone in the coldest month", () => {
		const samples = [5, -5, -9, -14, -20, -40].map((coldest) =>
			TRANSMISSIVITY.at({ ...BASE, coldest }),
		)
		for (let i = 1; i < samples.length; i++)
			expect(samples[i]).toBeLessThanOrEqual(samples[i - 1])
		expect(TRANSMISSIVITY.frostFactor(-40)).toBe(0.05)
		expect(TRANSMISSIVITY.frostFactor(0)).toBe(1)
	})

	it("is zero outside the active mask", () => {
		const out = TRANSMISSIVITY.perRegion({
			logK: Float32Array.of(-13, -13),
			ksMs: Float64Array.of(1e-5, 1e-5),
			soilDepthM: Float32Array.of(1, 1),
			slope: Float32Array.of(0.02, 0.02),
			coldest: Float32Array.of(5, 5),
			active: Uint8Array.of(1, 0),
		})
		expect(out[0]).toBeGreaterThan(0)
		expect(out[1]).toBe(0)
	})
})
