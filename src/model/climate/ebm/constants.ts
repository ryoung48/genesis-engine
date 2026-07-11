export const EMB_CONSTANTS = {
	chaotic: { min: 10, max: 50 },
	planet: {
		EARTH_RADIUS: 6.371e6,
	},
	stellar: {
		T_SUN: 5778,
		R_SUN: 6.9634e8,
		AU: 1.496e11,
		SIGMA: 5.67e-8,
	},
	time: {
		DAYS_PER_YEAR: 365,
		HOURS_PER_DAY: 24,
	},
	grid: { NUM_LAT: 36 },
	surface: {
		// Fallbacks used only when EBMConfig.albedo/iceAlbedo aren't set. No
		// OCEAN/LAND blend anymore -- BASE is a single whole-body Bond albedo,
		// set to Earth's real value since GREENHOUSE_FACTOR below is fit
		// against it specifically (the two defaults have to be used together).
		// ICE raised from 0.65 -> 0.8: 0.65 underrepresented permanent ice
		// sheets (fresh snow/glacial ice runs ~0.8-0.9 Bond albedo; 0.65 was
		// closer to a blend that leans toward older/dirtier sea ice) and left
		// Antarctica running far too warm in the EBM-vs-WorldClim comparison
		// (see earth-real-temperature-compare.smoke.test.ts).
		ALBEDO: { ICE: 0.7, BASE: 0.3 },
		// Fallback used only when neither EBMConfig.greenhouseFactor nor a
		// per-planet value is supplied. This is a per-planet DATA value now
		// (see SolPlanetSeed.greenhouseFactor in sol-system.ts), not derived
		// from a universal formula or scale -- each real body's value is
		// individually fit so EBM's simulated average matches its known real
		// surface temperature (see EnergyBalanceModel.computeGreenhouseOLR()
		// for the T_eq = T_blackbody*(1+greenhouseFactor/4) relationship).
		// 0.598 is Earth's fitted value, bisected in
		// earth-import-greenhouse-refit.smoke.test.ts directly against the real
		// imported Earth world's own land-only WorldClim bias (zeroed exactly),
		// not the idealized ALBEDO.landFraction() proxy earth-default-refit.
		// smoke.test.ts uses -- that proxy's by-latitude land shape doesn't match
		// the real planet's actual land distribution, which left a ~2C
		// calibration gap invisible until evaluated against the real import (see
		// earth-real-temperature-compare.smoke.test.ts). Re-fit whenever
		// ALBEDO.BASE/ICE change. Bodies fit with the ice feedback off
		// (sol-system.ts's per-planet greenhouseFactor values, all bisected with
		// iceAlbedoFeedback:false against each body's own real, measured albedo)
		// are unaffected by this default.
		GREENHOUSE_FACTOR: 0.598,
	},
	thermal: {
		OCEAN_HEAT_CAPACITY: 4e7,
		LAND_HEAT_CAPACITY: 1e7,
		ICE_LIMIT: 273.15 - 10,
	},
	orbital: {
		OBLIQUITY: 23.5,
		ECCENTRICITY: 0.0,
		PERIHELION: 90,
	},
}
