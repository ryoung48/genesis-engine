import { describe, expect, it } from "vitest"
import { WATER_RAIN } from "@/model/climate/precipitation/water-rain"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

describe("standalone water-rain model", () => {
	it("closes the water budget on a non-Earth aquaplanet", () => {
		const mesh = MESH.buildSphereMesh({
			n: 1000,
			jitter: 0,
			rng: RNG.createRng({ seed: 42 }),
		})
		const N = mesh.numRegions
		const monthlyLength = 12 * N
		const airTemperatureMonthlyC = new Float32Array(monthlyLength).fill(20)
		const seaSurfaceTemperatureMonthlyC = new Float32Array(monthlyLength).fill(
			22,
		)
		const windUMonthlyMs = new Float32Array(monthlyLength).fill(5)
		const result = WATER_RAIN.simulate({
			mesh,
			planet: {
				radiusKm: 4800,
				surfacePressurePa: 180_000,
				freezingPointC: 0,
				monthDays: new Float32Array(12).fill(40),
			},
			forcing: {
				elevationKm: new Float32Array(N),
				permanentWater: new Uint8Array(N).fill(1),
				airTemperatureMonthlyC,
				seaSurfaceTemperatureMonthlyC,
				windUMonthlyMs,
				windVMonthlyMs: new Float32Array(monthlyLength),
			},
			parameters: WATER_RAIN.PORTABLE_PRIOR_PARAMETERS,
		})

		for (let i = 0; i < monthlyLength; i++) {
			expect(Number.isFinite(result.precipitationMonthlyMm[i])).toBe(true)
			expect(result.precipitationMonthlyMm[i]).toBeGreaterThanOrEqual(0)
			expect(
				result.rainMonthlyMm[i] + result.snowMonthlyMmWaterEquivalent[i],
			).toBeCloseTo(result.precipitationMonthlyMm[i], 4)
		}
		for (const residual of result.waterBudgetResidualFraction) {
			expect(Math.abs(residual)).toBeLessThan(0.001)
		}
	})
})
