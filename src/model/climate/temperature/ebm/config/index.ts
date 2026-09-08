import type { EBMConfig } from "@/model/climate/temperature/ebm/config/types"

const earthClimate = {
	orbital: { OBLIQUITY: 23.44, ECCENTRICITY: 0.0167, PERIHELION: 102.94719 },
	stellar: {
		SIGMA: 5.670367e-8,
		T_SUN: (3.846e26 / (4 * Math.PI * 6.9634e8 ** 2 * 5.670367e-8)) ** 0.25,
		R_SUN: 6.9634e8,
		AU: 1.00000011 * 1.495978707e11,
	},
	time: { YEAR_LENGTH_DAYS: 3.155815248432e7 / 86400, HOURS_PER_DAY: 24 },
	discretization: {
		latitudeCount: 150,
		latitudeGrid: "equal-area",
		samplesPerYear: 60,
		insolationDays: 365,
		startSolarLongitudeDegrees: -90,
	},
	// The pinned EarthClimate input inherits POISE's 0.34 default, despite its README.
	landFraction: new Array(150).fill(0.34),
	landWaterCoupling: 0.8,
	seasonalSurface: {
		planckA: 203.3,
		planckB: 2.09,
		diffusion: 0.58,
		landAlbedo: 0.363,
		waterAlbedo: 0.263,
		iceAlbedo: 0.6,
		landHeatCapacity: 1.55e7,
		waterHeatCapacity: 4.428e6 * 70,
		iceDepositionRate: 2.25e-5,
		ablationFactor: 2.3,
		iceResetYears: 4,
	},
} satisfies EBMConfig

const iceBelts = {
	...earthClimate,
	orbital: { OBLIQUITY: 55, ECCENTRICITY: 0, PERIHELION: 0 },
	stellar: { ...earthClimate.stellar, AU: 1.02 * 1.495978707e11 },
	time: {
		...earthClimate.time,
		YEAR_LENGTH_DAYS:
			earthClimate.time.YEAR_LENGTH_DAYS * (1.02 / 1.00000011) ** 1.5,
	},
	discretization: {
		...earthClimate.discretization,
		latitudeCount: 151,
		samplesPerYear: 80,
		insolationDays: 376,
	},
	landFraction: new Array(151).fill(0.34),
} satisfies EBMConfig

// World generation runs the EBM on real, variable per-latitude land fractions
// (from the mesh), not earthClimate's uniform 0.34. Under variable land,
// earthClimate's strong ice-albedo feedback ice-locks the ~55%-land
// mid-latitude bands -- cold winters accumulate ice, the ice albedo reflects
// the summer sun, summer stays frozen -- which drags the tundra line ~15
// degrees equatorward. This variant softens the feedback (lower ice albedo,
// faster summer ablation) so the zonal profile stays realistic under real
// geography. The pinned earthClimate is untouched (VPLanet parity test).
const pipeline = {
	...earthClimate,
	seasonalSurface: {
		...earthClimate.seasonalSurface,
		iceAlbedo: 0.45,
		ablationFactor: 3.5,
	},
} satisfies EBMConfig

export const CONFIG = { earthClimate, iceBelts, pipeline }
