export type MoonOrbitRange = "inner" | "middle" | "outer" | "extreme"

export interface MoonParams {
	massKg: number
	diameterKm: number
	orbitalPeriodDays: number
	eccentricity: number
	inclinationDeg: number
	longitudeOfAscendingNodeDeg: number
	argumentOfPeriapsisDeg: number
	meanAnomalyAtEpochDeg: number
	orbitRange?: MoonOrbitRange
	semiMajorAxisPlanetDiameters?: number
	sizeClass?: number
}

export const MAX_MOONS = 3

export const MOON_DEFAULTS: MoonParams = {
	massKg: 7.34e22,
	diameterKm: 3474,
	orbitalPeriodDays: 27.3,
	eccentricity: 0.055,
	inclinationDeg: 5.1,
	longitudeOfAscendingNodeDeg: 0,
	argumentOfPeriapsisDeg: 0,
	meanAnomalyAtEpochDeg: 0,
	orbitRange: "middle",
	semiMajorAxisPlanetDiameters: 30.17,
	sizeClass: 2,
}
