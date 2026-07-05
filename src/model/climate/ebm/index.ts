import { ALBEDO } from "./albedo"
import { EMB_CONSTANTS } from "./constants"
import { INSOLATION } from "./insolation"

/* eslint-disable camelcase */

/**
 * How to fit EBMConfig.greenhouseFactor for a new body (see the field's own
 * doc for what it means physically):
 *
 * 1. Find the body's real known average surface temperature -- this is the
 *    target you're fitting against.
 * 2. Build an EnergyBalanceModel with that body's real orbital/stellar/
 *    albedo/pressure config and a candidate greenhouseFactor, then call
 *    model.initModel() ONLY (not runModel()) and read the area-weighted mean
 *    of model.temperature[i][0] across latitudes (weighted by model.dx[i]).
 *    This is the annual-mean equilibrium computed directly by
 *    seedPerLatitudeEquilibrium() -- exact, and takes microseconds, because
 *    it's a single linear solve, not a time-stepped simulation. Do NOT
 *    calibrate by calling runModel() and waiting for it to converge: for a
 *    high heat-capacity body (thick atmosphere/high pressure) that can take
 *    thousands of simulated years of real wall-clock time for no benefit --
 *    the transient path to equilibrium doesn't affect where it ends up.
 * 3. Bisect greenhouseFactor against that instant readout until it matches
 *    the real target temperature (a few dozen iterations, still
 *    milliseconds total). See git history around the Venus/Earth
 *    calibrations for worked examples of this exact bisection.
 * 4. Optionally sanity-check the fitted value with one real runModel() call
 *    at a normal year count -- it won't match the instant solve exactly
 *    (temperature-dependent ice-albedo feedback and seasonal structure are
 *    real nonlinearities the annual-mean linear solve ignores), but should
 *    land within about a degree or two for non-extreme bodies.
 *
 * Two things this method will NOT catch, so watch for them separately:
 * - Getting the OTHER config fields inconsistent with the real body (e.g.
 *   forgetting `landFraction: fill(1)` for an oceanless world lets the
 *   default Earth-like land/ocean heat-capacity split silently distort the
 *   result -- this happened once with Venus and produced a fitted g that
 *   was wrong for the wrong reason, and only agrees with a slow full run at
 *   all because both used the same distorted config).
 * - A fitted greenhouseFactor for one body does NOT linearly predict another
 *   body's value -- Earth's ~0.55 and Venus's ~9 aren't on the same scale
 *   you can interpolate; each real body needs its own independent fit.
 */
interface EBMConfig {
	orbital: typeof EMB_CONSTANTS.orbital
	stellar?: typeof EMB_CONSTANTS.stellar
	landFraction?: number[]
	radius?: number
	pressure?: number
	/**
	 * Bond albedo, 0..1 -- a single value for the whole body (no land/ocean
	 * blend), e.g. Mercury's real 0.088. Used whenever the local temperature
	 * is above the ice threshold; below it, iceAlbedo applies instead.
	 * Defaults to EMB_CONSTANTS.surface.ALBEDO.BASE (0.35, an Earth default).
	 */
	albedo?: number
	/**
	 * Ice-cap albedo, 0..1, used below the local ice threshold (same
	 * temperature-driven branch as before). Defaults to
	 * EMB_CONSTANTS.surface.ALBEDO.ICE (0.65, an Earth default).
	 */
	iceAlbedo?: number
	/**
	 * Fraction (0 and up, unbounded above) representing how strongly the
	 * atmosphere dampens outgoing longwave radiation -- 0 for a vacuum world
	 * (Mercury), larger for a thicker/more potent greenhouse atmosphere
	 * (Venus's real ~92 bar CO2 atmosphere needs a very large value to
	 * reproduce its actual ~737K surface temp). Replaces the old
	 * pressure-driven OLR_A/OLR_B formula (which grew unboundedly as
	 * pressure->0, one of the two independent causes of the EBM's old
	 * Mercury-divergence bug). See computeGreenhouseOLR() for the
	 * T_eq = T_blackbody*(1+greenhouseFactor/4) relationship this drives.
	 *
	 * There's no formula deriving this from pressure/composition -- each real
	 * body's value here is individually fit so EBM's simulated average matches
	 * its actual known surface temperature (see sol-system.ts's
	 * SolPlanetSeed.greenhouseFactor). A linear scale from one body's fitted
	 * value won't reliably predict another's; thick and thin atmospheres
	 * don't relate to a blackbody baseline the same way. Defaults to
	 * EMB_CONSTANTS.surface.GREENHOUSE_FACTOR (Earth's fitted value) when
	 * unset.
	 */
	greenhouseFactor?: number
	/**
	 * Intrinsic thermal emission temperature (K) from a body's own residual
	 * formation heat -- relevant for young and/or massive gas giants (real
	 * Jupiter/Saturn radiate meaningfully more energy than they receive from
	 * the Sun; Uranus is the outlier with almost none). 0 for anything without
	 * a known internal heat excess (all terrestrial planets and moons).
	 *
	 * Combined with solar heating as an added flux (sigma*T^4), not as a raw
	 * temperature -- both are independent radiative sources, and radiative
	 * fluxes add, temperatures don't (T_total^4 = T_solar^4 + T_internal^4,
	 * not T_total = T_solar + T_internal). Applied uniformly across every
	 * latitude/day, unlike solar insolation, since internal heat emerges from
	 * the core rather than being intercepted from one direction.
	 *
	 * A commonly-cited world-builder estimate for this is
	 * T_internal = 80 * sqrt(massEarths) / ageGyr -- see sol-system.ts's
	 * SolPlanetSeed for the fitted per-body values that used it as a
	 * starting point (still individually adjusted against each body's real
	 * known temperature, same as greenhouseFactor).
	 */
	internalHeatTempK?: number
	time?: {
		YEAR_LENGTH_DAYS?: number
		HOURS_PER_DAY?: number
	}
}

const radiansToDegrees = (rad: number) => rad * (180 / Math.PI)
const kelvinToCelsius = (kelvin: number) => kelvin - 273.15

function meanOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let sum = 0
	for (const value of values) sum += value
	return sum / values.length
}

function minOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let result = values[0]
	for (let i = 1; i < values.length; i++) {
		if (values[i] < result) result = values[i]
	}
	return result
}

function maxOf(values: readonly number[]): number {
	if (values.length === 0) return 0
	let result = values[0]
	for (let i = 1; i < values.length; i++) {
		if (values[i] > result) result = values[i]
	}
	return result
}

/**
 * Thomas algorithm for a tridiagonal system: lower[i]*x[i-1] + diag[i]*x[i] +
 * upper[i]*x[i+1] = rhs[i] (lower[0] and upper[n-1] are ignored). O(n), does
 * not mutate its inputs.
 */
function solveTridiagonal(
	lower: readonly number[],
	diag: readonly number[],
	upper: readonly number[],
	rhs: readonly number[],
): number[] {
	const n = diag.length
	const c = new Array(n)
	const d = new Array(n)
	c[0] = upper[0] / diag[0]
	d[0] = rhs[0] / diag[0]
	for (let i = 1; i < n; i++) {
		const m = diag[i] - lower[i] * c[i - 1]
		c[i] = upper[i] / m
		d[i] = (rhs[i] - lower[i] * d[i - 1]) / m
	}
	const x = new Array(n)
	x[n - 1] = d[n - 1]
	for (let i = n - 2; i >= 0; i--) {
		x[i] = d[i] - c[i] * x[i + 1]
	}
	return x
}

export class EnergyBalanceModel {
	lats: number[] = []
	lats_deg: number[] = []
	sin_lats: number[] = []
	lat_bounds: number[] = []
	sin_lat_bounds: number[] = []
	dx: number[] = []
	heat_capacity: number[] = []
	insolation: number[][] = []
	daylightHours: number[][] = []
	temperature: number[][] = []
	temperature_avg: number[] = []
	temperature_min: number[] = []
	temperature_max: number[] = []
	albedo: number[][] = []
	olr: number[][] = []
	land_fraction: number[] = []

	config: EBMConfig

	// Tridiagonal diffusion-transport coefficients linking each latitude band
	// to its neighbors (lowerCoef: i-1, upperCoef: i+1). These depend only on
	// static grid/radius/rotation/pressure config, never on temperature or
	// time, so they're computed once in initModel() and reused every step.
	lowerCoef: number[] = []
	upperCoef: number[] = []

	// Derived once from greenhouseFactor -- see computeGreenhouseOLR().
	olrTRef = 288
	olrA = 0
	olrB = 0
	// Analytic estimate of the mean equilibrium temperature (K), used to seed
	// initModel()'s temperature array instead of a hardcoded 288K. Without
	// this, a body whose true equilibrium is far from Earth's (e.g. Venus,
	// ~737K) has to slowly drift there from a bad starting point, rate-limited
	// by heat_capacity -- for a high-pressure world that can take thousands of
	// simulated years. Starting near the answer instead needs only enough
	// years to resolve latitude/season structure, not bulk warm-up.
	equilibriumGuess = 288
	// Uniform (not day/latitude-varying) flux from internalHeatTempK, added on
	// top of solar-driven absorbed flux everywhere -- see computeGreenhouseOLR().
	internalHeatFlux = 0

	constructor(config: EBMConfig) {
		this.config = config
	}

	/**
	 * Precomputes the (time-invariant) spatial diffusion coefficients linking
	 * each latitude band to its neighbors -- the same diffuser/boundary-
	 * averaging physics the old explicit flux calculation used, just expressed
	 * as constant tridiagonal coefficients so stepTemperature can solve for
	 * the new temperature implicitly (backward Euler) instead of extrapolating
	 * from the old one. Because these coefficients don't depend on T, an
	 * implicit step is unconditionally stable regardless of how large they
	 * get -- unlike the old explicit scheme, which diverged once radius got
	 * small and/or the day got long enough to push them past forward-Euler's
	 * stability limit (see ebm/mercury.smoke.test.ts).
	 */
	private computeDiffusionCoefficients(): void {
		const { grid, time, planet } = EMB_CONSTANTS
		const hoursPerDay = this.config.time?.HOURS_PER_DAY || time.HOURS_PER_DAY
		const rotationFactor = Math.pow(hoursPerDay / 24, 0.5)
		const radiusRatio =
			planet.EARTH_RADIUS / (this.config.radius || planet.EARTH_RADIUS)
		const radiusFactor = radiusRatio * radiusRatio
		const pressureFactor = Math.pow(this.config.pressure ?? 1.0, 0.5)
		const diffuser = (latDeg: number) => {
			const absLat = Math.abs(latDeg)
			return (
				(0.1 + 0.5 * Math.exp(-Math.pow((absLat - 45) / 25, 2))) *
				radiusFactor *
				pressureFactor *
				rotationFactor
			)
		}

		this.lowerCoef = new Array(grid.NUM_LAT).fill(0)
		this.upperCoef = new Array(grid.NUM_LAT).fill(0)

		// Boundary k separates cell k-1 (below) and cell k (above). Dbar(k) is
		// the same symmetric average of each side's own diffuser value the old
		// fluxSN/fluxNS scheme used.
		for (let k = 1; k < grid.NUM_LAT; k++) {
			const xBoundary = 0.5 * (this.sin_lats[k] + this.sin_lats[k - 1])
			const cos2LatBoundary = 1 - xBoundary * xBoundary
			const dBar =
				0.5 *
				cos2LatBoundary *
				(diffuser(this.lats_deg[k]) + diffuser(this.lats_deg[k - 1]))
			const sinDiff = this.sin_lats[k] - this.sin_lats[k - 1]
			const boundaryCoef = Math.abs(sinDiff) > 0 ? dBar / sinDiff : 0

			if (Math.abs(this.dx[k - 1]) > 0) {
				this.upperCoef[k - 1] += boundaryCoef / this.dx[k - 1]
			}
			if (Math.abs(this.dx[k]) > 0) {
				this.lowerCoef[k] += boundaryCoef / this.dx[k]
			}
		}
	}

	/**
	 * Derives the OLR linearization's reference temperature and slope from
	 * greenhouseFactor, replacing the old pressure-power-law formula. Models
	 * outgoing radiation as a greenhouse-damped blackbody curve,
	 * OLR(T) = sigma*T^4 / (1+greenhouseFactor), linearized around this
	 * planet's own (undamped) blackbody equilibrium temperature:
	 *
	 *   olrTRef = T_blackbody                                   -- linearization point
	 *   olrB    = 4*sigma*olrTRef^3 / (1 + greenhouseFactor)     -- the slope
	 *   olrA    = sigma*olrTRef^4 / (1 + greenhouseFactor)       -- OLR at olrTRef
	 *
	 * olrTRef is deliberately left undamped: it's just the point the curve is
	 * linearized around, not an assumed final answer. The actual equilibrium
	 * emerges from the balance equation itself once olrA/olrB are damped --
	 * solving absorbed = olrA + olrB*(T_eq-olrTRef) algebraically gives
	 * T_eq = olrTRef*(1 + greenhouseFactor/4). (An earlier version of this
	 * pre-boosted olrTRef by (1+greenhouseFactor) directly -- that assumed the
	 * answer *and* let the balance equation re-equilibrate around it, which
	 * double-counted the warming and ran ~4x too hot.)
	 *
	 * greenhouseFactor=0 gives olrB = 4*sigma*T^3, the true (undamped)
	 * blackbody radiative sensitivity -- correct for an airless world. Larger
	 * values flatten that slope, same direction a thicker/more potent
	 * atmosphere would in reality.
	 *
	 * internalHeatTempK (residual/formation heat, relevant for gas giants) is
	 * folded in here as an added flux, sigma*internalHeatTempK^4, alongside
	 * the mean solar flux -- both heat the body independently, and radiative
	 * fluxes add (T^4 terms), not temperatures. This flux also gets added to
	 * every cell's absorbed term in stepTemperature/seedPerLatitudeEquilibrium
	 * (uniformly, unlike solar insolation, since internal heat isn't coming
	 * from one direction). The T_eq = olrTRef*(1+greenhouseFactor/4) relation
	 * above still holds unchanged: it only relies on absorbed_mean =
	 * sigma*olrTRef^4 at the reference point, true regardless of whether that
	 * flux is solar, internal, or both.
	 */
	private computeGreenhouseOLR(): void {
		const { stellar: defaultStellar, surface } = EMB_CONSTANTS
		const stellar = this.config.stellar || defaultStellar
		const greenhouseFactor =
			this.config.greenhouseFactor ?? surface.GREENHOUSE_FACTOR
		const s0 =
			stellar.SIGMA *
			stellar.T_SUN ** 4 *
			((stellar.R_SUN * stellar.R_SUN) / (stellar.AU * stellar.AU))
		// A single characteristic albedo just to center the linearization --
		// the real per-cell albedo (ALBEDO.update's ice/base table) still
		// drives the actual absorbed flux every step.
		const albedoEstimate = this.config.albedo ?? surface.ALBEDO.BASE
		const internalHeatTempK = this.config.internalHeatTempK ?? 0
		this.internalHeatFlux = stellar.SIGMA * internalHeatTempK ** 4
		const meanSolarFlux = (s0 * (1 - albedoEstimate)) / 4
		const blackbodyTemp =
			((meanSolarFlux + this.internalHeatFlux) / stellar.SIGMA) ** 0.25

		this.olrTRef = blackbodyTemp
		this.olrB = (4 * stellar.SIGMA * this.olrTRef ** 3) / (1 + greenhouseFactor)
		this.olrA = (stellar.SIGMA * this.olrTRef ** 4) / (1 + greenhouseFactor)
		this.equilibriumGuess = this.olrTRef * (1 + greenhouseFactor / 4)
	}

	/**
	 * Solves for the periodic-steady-state annual-mean temperature at every
	 * latitude directly, with no time-stepping, and seeds this.temperature
	 * with it. This replaces needing to run the transient simulation for
	 * hundreds-to-thousands of years just to let a bad initial guess (a flat
	 * 288K, or even a single global equilibriumGuess scalar) settle by slow
	 * exponential relaxation -- a real problem for high heat-capacity bodies
	 * like Venus (92 bar -> ~29x Earth's heat capacity).
	 *
	 * The trick: average stepTemperature's balance equation over one full
	 * year. Because a periodic steady state returns to the same value after
	 * 365 days, the time-averaged rate of change (d(heat_capacity*T)/dt) is
	 * exactly zero -- heat_capacity drops out entirely, and what's left is a
	 * static tridiagonal system (mean absorbed flux balances OLR balances
	 * diffusion) solvable in one shot, using the same solveTridiagonal()
	 * helper stepTemperature already uses.
	 *
	 * This gives the exact annual mean per latitude; runModel() still needs
	 * to time-step afterward to resolve the within-year seasonal/diurnal
	 * wiggle around it, but that settles fast since heat_capacity no longer
	 * has to also fix a large initial error.
	 */
	private seedPerLatitudeEquilibrium(): void {
		const { grid, surface } = EMB_CONSTANTS
		// Same characteristic-albedo simplification computeGreenhouseOLR()
		// uses -- the actual per-day ice/base table needs a temperature to
		// evaluate, which is exactly what we're solving for.
		const albedoEstimate = this.config.albedo ?? surface.ALBEDO.BASE
		const lower = new Array(grid.NUM_LAT)
		const diag = new Array(grid.NUM_LAT)
		const upper = new Array(grid.NUM_LAT)
		const rhs = new Array(grid.NUM_LAT)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			const meanAbsorbed =
				meanOf(this.insolation[i]) * (1 - albedoEstimate) +
				this.internalHeatFlux
			lower[i] = -this.lowerCoef[i]
			upper[i] = -this.upperCoef[i]
			diag[i] = this.olrB + this.lowerCoef[i] + this.upperCoef[i]
			rhs[i] = meanAbsorbed - this.olrA + this.olrB * this.olrTRef
		}
		const meanTemps = solveTridiagonal(lower, diag, upper, rhs)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			this.temperature[i].fill(meanTemps[i])
		}
	}

	stepTemperature(
		tIdx: number,
		dt: number,
		lower: readonly number[],
		diag: readonly number[],
		upper: readonly number[],
	): void {
		const { grid, time } = EMB_CONSTANTS
		const nextIdx = (tIdx + 1) % time.DAYS_PER_YEAR
		const rhs = new Array(grid.NUM_LAT).fill(0)

		for (let i = 0; i < grid.NUM_LAT; i++) {
			const absorbed =
				this.insolation[i][tIdx] * (1 - this.albedo[i][tIdx]) +
				this.internalHeatFlux
			// Diagnostic only (matches the old explicit record): OLR evaluated
			// at the old temperature, not part of the implicit solve itself.
			this.olr[i][tIdx] =
				this.olrA + this.olrB * (this.temperature[i][tIdx] - this.olrTRef)

			rhs[i] =
				this.heat_capacity[i] * this.temperature[i][tIdx] +
				dt * absorbed -
				dt * this.olrA +
				dt * this.olrB * this.olrTRef
		}

		const newTemps = solveTridiagonal(lower, diag, upper, rhs)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			this.temperature[i][nextIdx] = newTemps[i]
		}

		ALBEDO.update({
			albedo: this.albedo,
			lats_deg: this.lats_deg,
			temperature: this.temperature,
			time: nextIdx,
			orbital: this.config.orbital,
			baseAlbedo: this.config.albedo,
			iceAlbedo: this.config.iceAlbedo,
		})
	}

	initModel() {
		const { grid, thermal } = EMB_CONSTANTS
		const pressure = this.config.pressure ?? 1.0
		const pressureCapFactor = Math.pow(pressure, 0.7)
		this.land_fraction = this.config.landFraction || ALBEDO.landFraction()

		// Only depends on config (stellar/albedo/greenhouseFactor), not on the
		// grid built below -- computed early so equilibriumGuess is ready to
		// seed the temperature array instead of a hardcoded 288K.
		this.computeGreenhouseOLR()

		for (let i = 0; i < grid.NUM_LAT; i++) {
			const lat = -Math.PI / 2 + (Math.PI * i) / (grid.NUM_LAT - 1)
			this.lats.push(lat)
			this.lats_deg.push(radiansToDegrees(lat))
			this.sin_lats.push(Math.sin(lat))
		}

		for (let i = 0; i < grid.NUM_LAT + 1; i++) {
			const latBound = -Math.PI / 2 + (Math.PI * i) / grid.NUM_LAT
			this.lat_bounds.push(latBound)
			this.sin_lat_bounds.push(Math.sin(latBound))
		}

		for (let i = 0; i < grid.NUM_LAT; i++) {
			this.dx.push(this.sin_lat_bounds[i + 1] - this.sin_lat_bounds[i])
			this.heat_capacity.push(
				(thermal.LAND_HEAT_CAPACITY * this.land_fraction[i] +
					thermal.OCEAN_HEAT_CAPACITY * (1 - this.land_fraction[i])) *
					pressureCapFactor,
			)
			this.temperature.push(new Array(EMB_CONSTANTS.time.DAYS_PER_YEAR).fill(0))
			this.albedo.push(new Array(EMB_CONSTANTS.time.DAYS_PER_YEAR).fill(0))
			this.olr.push(new Array(EMB_CONSTANTS.time.DAYS_PER_YEAR).fill(0))
		}

		this.computeDiffusionCoefficients()

		const { _insolation, _daylight_hours } = INSOLATION.compute(
			this.lats,
			this.config.orbital,
			this.config.stellar,
		)
		this.insolation = _insolation
		this.daylightHours = _daylight_hours

		this.seedPerLatitudeEquilibrium()

		ALBEDO.update({
			albedo: this.albedo,
			lats_deg: this.lats_deg,
			temperature: this.temperature,
			time: 0,
			orbital: this.config.orbital,
			baseAlbedo: this.config.albedo,
			iceAlbedo: this.config.iceAlbedo,
		})
	}

	runModel(years: number, dtDays: number): void {
		this.initModel()
		const { grid, time } = EMB_CONSTANTS
		const secondsPerDay = 24 * 3600
		const yearLengthDays =
			this.config.time?.YEAR_LENGTH_DAYS || time.DAYS_PER_YEAR
		const secondsPerSampleDay =
			(yearLengthDays / time.DAYS_PER_YEAR) * secondsPerDay
		const dt = dtDays * secondsPerSampleDay
		const stepsPerDay = Math.floor(1 / dtDays)
		const totalSteps = time.DAYS_PER_YEAR * stepsPerDay * years
		let lastTemp = this.temperature.map((row) => row.map(() => 0))

		// The tridiagonal matrix (lower/diag/upper) is time-invariant -- built
		// once here from dt, heat_capacity, and the precomputed diffusion
		// coefficients -- so every step below only has to rebuild the RHS
		// (which depends on that day's insolation/albedo) and re-solve.
		const lower = new Array(grid.NUM_LAT)
		const diag = new Array(grid.NUM_LAT)
		const upper = new Array(grid.NUM_LAT)
		for (let i = 0; i < grid.NUM_LAT; i++) {
			lower[i] = -dt * this.lowerCoef[i]
			upper[i] = -dt * this.upperCoef[i]
			diag[i] =
				this.heat_capacity[i] +
				dt * (this.lowerCoef[i] + this.upperCoef[i]) +
				dt * this.olrB
		}

		for (let step = 0; step < totalSteps; step++) {
			const day = Math.floor(step / stepsPerDay)
			const tIdx = day % time.DAYS_PER_YEAR
			if (step % Math.floor(totalSteps / 10) === 0) {
				let delta = 0
				for (let i = 0; i < grid.NUM_LAT; i++) {
					for (let j = 0; j < time.DAYS_PER_YEAR; j++) {
						delta += Math.abs(lastTemp[i][j] - this.temperature[i][j])
					}
				}
				lastTemp = this.temperature.map((row) => row.slice())
				if (delta < 5) break
			}
			this.stepTemperature(tIdx, dt, lower, diag, upper)
		}

		for (const row of this.temperature) {
			for (let i = 0; i < row.length; i++) {
				row[i] = kelvinToCelsius(Number.isNaN(row[i]) ? 0 : row[i])
			}
		}

		this.temperature_avg = this.temperature.map((row) => meanOf(row))
		this.temperature_min = this.temperature.map((row) => minOf(row))
		this.temperature_max = this.temperature.map((row) => maxOf(row))
	}
}
