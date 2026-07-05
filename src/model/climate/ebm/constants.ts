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
		ALBEDO: { ICE: 0.65, BASE: 0.3 },
		// Fallback used only when neither EBMConfig.greenhouseFactor nor a
		// per-planet value is supplied. This is a per-planet DATA value now
		// (see SolPlanetSeed.greenhouseFactor in sol-system.ts), not derived
		// from a universal formula or scale -- each real body's value is
		// individually fit so EBM's simulated average matches its known real
		// surface temperature (see EnergyBalanceModel.computeGreenhouseOLR()
		// for the T_eq = T_blackbody*(1+greenhouseFactor/4) relationship).
		// 0.55 is Earth's fitted value (paired with ALBEDO.BASE=0.3 above,
		// reproduces ~14.8C).
		GREENHOUSE_FACTOR: 0.55,
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
