import { describe, expect, it } from "vitest"
import { EnergyBalanceModel } from "."
import { EMB_CONSTANTS } from "./constants"

/**
 * Mercury: airless, 0.387 AU, near-zero obliquity, 3:2 spin-orbit resonance
 * gives a solar day (noon-to-noon) of ~4222.6h vs a sidereal day of 1407.6h.
 * Real surface temp ranges ~100K (night) to ~700K (subsolar day).
 *
 * The EBM used to diverge to 0K on these parameters at the default
 * dtDays=0.5 (see git history for the original failing versions of these
 * tests) -- its forward-Euler integration was only conditionally stable, and
 * Mercury's small radius, long solar day, and near-vacuum pressure each
 * independently pushed it past that limit. Switching stepTemperature() to an
 * implicit (backward Euler) tridiagonal solve made it unconditionally
 * stable, so all of these now produce finite, plausible temperatures at the
 * same dt that used to blow up.
 */
function mercuryConfig(overrides: { radius?: number; pressure?: number } = {}) {
	return {
		orbital: { OBLIQUITY: 0.03, ECCENTRICITY: 0.2056, PERIHELION: 90 },
		stellar: { ...EMB_CONSTANTS.stellar, AU: 0.387 * EMB_CONSTANTS.stellar.AU },
		time: { HOURS_PER_DAY: 4222.6, YEAR_LENGTH_DAYS: 88 },
		landFraction: new Array(EMB_CONSTANTS.grid.NUM_LAT).fill(1), // no ocean
		radius: overrides.radius ?? 2439700,
		pressure: overrides.pressure ?? 1e-14, // ~vacuum
		albedo: 0.088, // real Mercury Bond albedo (sol-system.ts)
		greenhouseFactor: 0, // vacuum world, by definition (sol-system.ts)
	}
}

describe("EBM on Mercury data (implicit integration)", () => {
	it("pressure alone (near-vacuum OLR scaling) no longer diverges", () => {
		function run(pressure: number) {
			const model = new EnergyBalanceModel({
				orbital: { OBLIQUITY: 0.03, ECCENTRICITY: 0.2056, PERIHELION: 90 },
				stellar: {
					...EMB_CONSTANTS.stellar,
					AU: 0.387 * EMB_CONSTANTS.stellar.AU,
				},
				landFraction: new Array(EMB_CONSTANTS.grid.NUM_LAT).fill(1),
				radius: 6.371e6, // Earth radius, not Mercury's
				pressure, // Earth rotation (24h default) -- only pressure varies
			})
			model.runModel(30, 0.5)
			const flat = model.temperature.flat()
			return { min: Math.min(...flat), max: Math.max(...flat) }
		}

		const thin = run(0.01)
		expect(Number.isFinite(thin.min)).toBe(true)
		expect(Number.isFinite(thin.max)).toBe(true)
		expect(thin.min).toBeGreaterThan(-273)

		const vacuum = run(1e-14)
		expect(Number.isFinite(vacuum.min)).toBe(true)
		expect(Number.isFinite(vacuum.max)).toBe(true)
		expect(vacuum.min).toBeGreaterThan(-273)
	})

	it("the parameters a UI author would naturally plug in produce a stable, non-degenerate result", () => {
		const model = new EnergyBalanceModel(mercuryConfig())
		model.runModel(30, 0.5) // same dtDays useEbmPreview.ts uses for every body
		const flat = model.temperature.flat()

		expect(flat.every((v) => Number.isFinite(v))).toBe(true)
		// Previously every cell collapsed to exactly -273.15C; now there should
		// be real spatial/seasonal variation, not one repeated degenerate value.
		expect(new Set(flat.map((v) => v.toFixed(1))).size).toBeGreaterThan(1)
		const min = Math.min(...flat)
		const max = Math.max(...flat)
		expect(min).toBeGreaterThan(-273)
		// With greenhouseFactor=0 (correct for a vacuum world), EBM now uses the
		// true undamped blackbody radiative response, so hot latitude/day means
		// well above 100C are physically expected here -- real Mercury's
		// subsolar peak is ~427C (700K); EBM's day-averaged (not instantaneous)
		// values landing in the low hundreds of C is in the right ballpark, not
		// a regression.
		expect(max).toBeLessThan(500)
	})

	it("small radius + long solar day (previously ~90x the tuned diffusion coefficient) stays stable", () => {
		const results = [2439700, 6.371e6, 6.371e7].map((radius) => {
			const model = new EnergyBalanceModel(
				mercuryConfig({ radius, pressure: 1.0 }),
			)
			model.runModel(30, 0.5)
			const flat = model.temperature.flat()
			return { radius, min: Math.min(...flat), max: Math.max(...flat) }
		})

		for (const result of results) {
			expect(Number.isFinite(result.min)).toBe(true)
			expect(Number.isFinite(result.max)).toBe(true)
			expect(result.min).toBeGreaterThan(-273)
		}
	})

	it("no longer needs a shrunk timestep to stay stable at Mercury's parameters", () => {
		const atDefaultDt = new EnergyBalanceModel(mercuryConfig({ pressure: 1.0 }))
		atDefaultDt.runModel(30, 0.5)
		const flatDefault = atDefaultDt.temperature.flat()

		expect(flatDefault.every((v) => Number.isFinite(v))).toBe(true)
		expect(Math.min(...flatDefault)).toBeGreaterThan(-273)
	})
})
