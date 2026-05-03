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
		ALBEDO: { ICE: 0.65, LAND: 0.35, OCEAN: 0.25 },
		OLR_A: 238,
		OLR_B: 2.8,
		OLR_T_REF: 288,
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
