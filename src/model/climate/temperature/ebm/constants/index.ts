import { ORBIT_BODY } from "@/model/celestial/orbit-body"

const embConstants = {
	chaotic: { min: 10, max: 50 },
	planet: {
		EARTH_RADIUS: ORBIT_BODY.earthRadiusM,
	},
	stellar: {
		T_SUN: 5778,
		R_SUN: 6.9634e8,
		AU: ORBIT_BODY.astronomicalUnitM,
		SIGMA: 5.67e-8,
	},
	time: {
		DAYS_PER_YEAR: 365,
		HOURS_PER_DAY: 24,
	},
	grid: { NUM_LAT: 36 },
	surface: {
		// Earth anchor for the scalar (non-spatial) greenhouse estimator in
		// greenhouse-estimate -- used for orbit <-> temperature / habitable-zone
		// math during celestial generation. The spatial EBM no longer uses it;
		// it runs the fixed POISE OLR law from seasonalSurface.planckA/planckB.
		GREENHOUSE_FACTOR: 0.7005100711248814,
	},
	orbital: {
		OBLIQUITY: 23.44,
		ECCENTRICITY: 0.0,
		PERIHELION: 90,
	},
}

export const CONSTANTS = {
	embConstants,
}
