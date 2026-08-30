/**
 * Inputs for the SpaceEngine-style analytic climate model
 * (see https://spaceengine.org/articles/the-climate-model/).
 *
 * This is a comparison/reference model sitting alongside the spatial EBM
 * (src/model/climate/temperature/ebm). It is a closed-form evaluation -- no
 * time integration -- covering the terrestrial + atmosphere, single-star case
 * only. Gas giants, tidally-locked bodies and multi-star systems are out of
 * scope here.
 *
 * Rather than one interactive lat/lon snapshot, it exposes the two axes that
 * actually carry signal for this model class:
 *  - `seasonalField`  -- latitude x time-of-year, the zonal-mean temperature
 *  - `diurnalProfile` -- temperature around one solar day at a fixed latitude
 */
export interface SpaceEngineClimateConfig {
	/** Effective temperature of the host star, Kelvin. */
	starTemperatureK: number
	/** Radius of the host star, metres. */
	starRadiusM: number
	/** Orbital semi-major axis, metres. */
	semiMajorAxisM: number
	/** Orbital eccentricity, 0..1. */
	eccentricity: number
	/**
	 * Seasonal reference angle, degrees -- same convention as the EBM's
	 * `orbital.PERIHELION` (Ls at aphelion), so the two models place the
	 * seasons identically for a given body.
	 */
	perihelionDeg: number
	/** Axial tilt, degrees. */
	obliquityDeg: number
	/** Bond albedo, 0..1. */
	bondAlbedo: number
	/**
	 * EBM greenhouse factor -- applied as a uniform `+T_eq·(greenhouseFactor/4)`
	 * warming offset (a per-cell multiply, the EBM's own equilibrium relation,
	 * stretches the spatial gradients past anything physical).
	 */
	greenhouseFactor: number
	/** Surface atmospheric pressure, bar. 0 => airless (no heat redistribution). */
	pressureBar: number
	/** Atmospheric specific heat capacity at constant pressure, J/(kg·K). */
	atmosphereCp: number
	/** Surface gravity, m/s². */
	surfaceGravityMs2: number
	/** Characteristic near-surface wind speed for advective transport, m/s. */
	windSpeedMs: number
	/** Planet radius, metres. */
	planetRadiusM: number
	/** Solar day length, hours. */
	hoursPerDay: number
	/** Fixed extra surface temperature from internal heat, Kelvin (optional). */
	internalHeatTempK?: number
	/** Seismology total-heating temperature bump, Kelvin (optional). */
	seismologyTotalHeatingK?: number
	/** Number of latitude rows in the output grids. */
	numLat: number
	/** Number of time-of-year columns in the seasonal field. */
	numYearSamples: number
	/** Number of samples across one solar day in the diurnal profiles. */
	numDaySamples: number
	/** Latitudes (degrees) to trace a diurnal curve for. */
	diurnalLatitudesDeg: number[]
}

export interface SpaceEngineSeasonalField {
	/** Latitude grid, degrees, south-to-north. */
	latsDeg: number[]
	/** Time-of-year grid, fraction 0..1 (0 = northern spring equinox). */
	yearFractions: number[]
	/** Zonal- and diurnal-mean surface temperature [latIndex][yearIndex], °C. */
	zonalMeanC: number[][]
	/** Area- and year-averaged global mean surface temperature, °C. */
	globalMeanC: number
	maxC: number
	minC: number
	/** Meridional heat-redistribution weight actually used, 0..1. */
	meridionalRedistribution: number
}

export interface SpaceEngineDiurnalCurve {
	/** Latitude this curve is for, degrees. */
	latitudeDeg: number
	/** Surface temperature at each local hour, °C (len = numDaySamples). */
	temperatureC: number[]
	/** Local hour the sun rises / sets; null under polar day or polar night. */
	sunriseHour: number | null
	sunsetHour: number | null
	/** "day" = sun never sets, "night" = sun never rises, null = normal cycle. */
	polar: "day" | "night" | null
	/** Mean over the day, °C. */
	meanC: number
	/** Peak-to-peak diurnal range (max − min), °C. */
	rangeC: number
}

export interface SpaceEngineDiurnalField {
	/** Time of year these profiles were taken at, fraction 0..1. */
	yearFraction: number
	/** Local solar time grid, hours 0..24 (0/24 = midnight, 12 = noon). */
	localHours: number[]
	/** One curve per requested latitude. */
	curves: SpaceEngineDiurnalCurve[]
	/**
	 * Longitudinal (day/night) redistribution efficiency, 0..1 -- ~1 means the
	 * curves are nearly flat (fast rotator / thick air), ~0 means a strong
	 * day/night swing (airless-like).
	 */
	redistribution: number
}
