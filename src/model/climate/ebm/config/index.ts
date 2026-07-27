import { CONSTANTS } from "@/model/climate/ebm/constants"

export interface EBMConfig {
	orbital: typeof CONSTANTS.embConstants.orbital
	stellar?: typeof CONSTANTS.embConstants.stellar
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
	/**
	 * Enables the smooth, temperature-driven ice/snow albedo transition (see
	 * albedo.ts's iceAlbedoAt). Defaults to true. Set false for bodies whose
	 * `albedo` is already a real, empirically-measured whole-body Bond albedo
	 * (every case in sol-bodies-refit.smoke.test.ts) -- synthetic ice modeling
	 * would override that known value instead of refining it.
	 */
	iceAlbedoFeedback?: boolean
	/**
	 * Ported from galaxy-gen's TEMPERATURE.finalize seismologyMod -- a body's
	 * geologic/tidal heating (system-seismology.ts's SeismologyProfile.
	 * totalHeating, itself ported from galaxy-gen's SEISMOLOGY.total and on
	 * the same Kelvin-equivalent flux scale), applied as
	 * (T_solve^4 + seismologyTotalHeatingK^4)^0.25 to every cell AFTER
	 * runModel()'s full diffusive/seasonal solve has already converged.
	 *
	 * Deliberately NOT folded in like internalHeatTempK (which participates
	 * in computeGreenhouseOLR's blackbody linearization and every step's
	 * absorbed flux, so it reshapes the whole equilibrium -- ice-albedo
	 * feedback, seasonal amplitude, latitude diffusion, all of it). Unlike
	 * internal formation heat, seismology.totalHeating is a coarse,
	 * dice-driven worldbuilder figure (tidal stress, age/size-based residual
	 * heat), not a calibrated physical constant -- galaxy-gen itself only
	 * ever adds it as one final algebraic bump on an already-computed mean
	 * temperature, never inside a spatial energy-balance solve (it doesn't
	 * have one). A uniform post-solve bump is the equivalent operation here:
	 * every latitude/day gets the same floor-raise, with no interaction with
	 * the dynamics that produced the pre-bump field.
	 *
	 * 0 (no bump) for the overwhelming majority of bodies -- old, low-stress
	 * worlds sit in system-seismology.ts's "dead" heating regime, and this
	 * only matters for geologically/tidally active worlds (e.g. an Io-analog
	 * moon).
	 *
	 * Callers should NOT pass this for a jovian: computeResidualHeating's
	 * stress formula (sizeClass - starAgeGyr + moonSizeClassTotal, squared)
	 * was tuned for rocky/icy geologic stress, and a jovian's huge sizeClass
	 * (16-18) plus several sizeable moons routinely produces a totalHeating
	 * of 100-400+ -- large enough that (T_solve^4 + that^4)^0.25 alone
	 * exceeds Jupiter/Saturn/Uranus/Neptune's real known temperature even at
	 * greenhouseFactor's floor of 0, since greenhouseFactor can only ever
	 * warm a body above its blackbody-with-albedo temperature, never cool it
	 * below. Jovians already get real internal heat correctly, and
	 * individually, via their own fitted internalHeatTempK -- see
	 * sol-bodies-refit.smoke.test.ts's failed attempt to refit
	 * greenhouseFactor against a jovian with this bump included, in git
	 * history, for the numbers.
	 */
	seismologyTotalHeatingK?: number
}
