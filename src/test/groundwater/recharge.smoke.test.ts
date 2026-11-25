import { describe, expect, it } from "vitest"
import { RECHARGE } from "@/model/geography/terrain/groundwater/recharge"
import { ROCK_KEY } from "@/model/geography/terrain/groundwater/rock-key"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG

const BASE = {
	runoffMm: 300,
	logK: -13,
	infiltration: 0.6,
	slope: 0.02,
	permafrost: 0,
}

describe("recharge", () => {
	it("stays between zero and runoff", () => {
		for (const logK of [-18, -16.5, -14, -12, -9]) {
			for (const infiltration of [0, 0.5, 1]) {
				for (const slope of [0, 0.05, 0.5]) {
					for (const permafrost of [0, 1]) {
						const mm = RECHARGE.rechargeMmOf({
							...BASE,
							logK,
							infiltration,
							slope,
							permafrost,
						})
						expect(mm).toBeGreaterThanOrEqual(0)
						expect(mm).toBeLessThanOrEqual(BASE.runoffMm)
					}
				}
			}
		}
	})

	it("rises with permeability and infiltration and falls with slope", () => {
		const base = RECHARGE.rechargeMmOf(BASE)
		expect(RECHARGE.rechargeMmOf({ ...BASE, logK: -12 })).toBeGreaterThan(base)
		expect(
			RECHARGE.rechargeMmOf({ ...BASE, infiltration: 0.9 }),
		).toBeGreaterThan(base)
		expect(RECHARGE.rechargeMmOf({ ...BASE, slope: 0.2 })).toBeLessThan(base)
	})

	it("keeps 1 - frostCut of the unfrozen value under full permafrost", () => {
		const unfrozen = RECHARGE.rechargeMmOf(BASE)
		const frozen = RECHARGE.rechargeMmOf({ ...BASE, permafrost: 1 })
		expect(frozen / unfrozen).toBeCloseTo(1 - C.frostCut, 9)
	})

	it("permafrost ramps from none at -1 C to full at -8 C", () => {
		expect(RECHARGE.permafrost(0)).toBe(0)
		expect(RECHARGE.permafrost(-1)).toBe(0)
		expect(RECHARGE.permafrost(-8)).toBe(1)
		expect(RECHARGE.permafrost(-4)).toBeGreaterThan(0)
		expect(RECHARGE.permafrost(-4)).toBeLessThan(1)
	})

	it("limestone gains karst permeability only where dissolving is above zero", () => {
		const limestone = ROCK_KEY.keys.indexOf("limestone")
		const sandstone = ROCK_KEY.keys.indexOf("sandstone")
		const wet = { rain: 1500, mean: 15 }
		const dry = { rain: 100, mean: 15 }
		const cold = { rain: 1500, mean: -10 }
		const run = (code: number, climate: { rain: number; mean: number }) =>
			RECHARGE.perRegion({
				keyCode: Uint8Array.of(code),
				runoffMm: Float32Array.of(300),
				infiltration: Float32Array.of(0.6),
				slope: Float32Array.of(0.02),
				climate: {
					rain: Float32Array.of(climate.rain),
					pet: Float32Array.of(800),
					mean: Float32Array.of(climate.mean),
					coldest: Float32Array.of(climate.mean - 10),
					warmest: Float32Array.of(climate.mean + 10),
					wetIndex: Float32Array.of(1),
				},
				active: Uint8Array.of(1),
				secondsPerYear: 3.15576e7,
			})
		expect(RECHARGE.dissolving(wet)).toBeGreaterThan(0)
		expect(RECHARGE.dissolving(dry)).toBe(0)
		expect(RECHARGE.dissolving(cold)).toBe(0)
		expect(run(limestone, wet).logK[0]).toBeCloseTo(
			C.logK.limestone + C.karstLogK * RECHARGE.dissolving(wet),
			5,
		)
		expect(run(limestone, dry).logK[0]).toBeCloseTo(C.logK.limestone, 5)
		expect(run(sandstone, wet).logK[0]).toBeCloseTo(C.logK.sandstone, 5)
	})
})
