import type { OrbitGroup } from "@/model/celestial/orbit-body/types"

export interface ComputeWeatherProfileInput {
	pressureBar: number
	siderealDayHours: number
	axialTiltDeg: number
	/** For a moon, this is its PARENT's orbital period around the star (what
	 * actually drives a season), not the moon's own short orbit around the
	 * parent -- see WEATHER.computeProfile's callers. */
	orbitalPeriodDays: number
	/** For a moon, this is its PARENT's eccentricity around the star, for the
	 * same reason as orbitalPeriodDays above. */
	eccentricity: number
	diameterKm: number
	group: OrbitGroup
	/** For a moon, this is its PARENT's real orbital distance/luminosity (the
	 * star-relative position that actually sets insolation), not the moon's
	 * own short orbit around the parent -- same convention as
	 * orbitalPeriodDays/eccentricity above. Only used for a jovian's
	 * insolation-based internal-heat-dominance proxy. */
	orbitalDistanceAU: number
	luminositySol: number
	/** seismology.totalHeating (residual + tidal) -- only used for a
	 * non-jovian body's internal-heat wind boost (an Io-analog moon should
	 * register stronger winds than its geometry alone predicts). Excluded
	 * for jovians, same as temperature's own effectiveSeismology exclusion:
	 * the residual-heating formula isn't tuned for a jovian's huge
	 * sizeClass. */
	totalHeating: number
}
