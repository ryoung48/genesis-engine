export type MoonOrbitRange = "inner" | "middle" | "outer" | "extreme"

export interface MoonParams {
	id: number
	massKg: number
	diameterKm: number
	orbitalPeriodDays: number
	eccentricity: number
	inclinationDeg: number
	longitudeOfAscendingNodeDeg: number
	argumentOfPeriapsisDeg: number
	meanAnomalyAtEpochDeg: number
	axialTiltDeg: number
	retrogradeRotation: boolean
	orbitRange?: MoonOrbitRange
	semiMajorAxisPlanetDiameters?: number
	sizeClass?: number
}

/** ID reserved for the star (used as the target of a solar tide lock). */
export const STAR_ID = 0

export type TideLock = { type: "solar" | "lunar"; target: number }

export const MAX_MOONS = 3

export const MOON_DEFAULTS: MoonParams = {
	id: 1,
	massKg: 7.34e22,
	diameterKm: 3474,
	orbitalPeriodDays: 27.3,
	eccentricity: 0.055,
	inclinationDeg: 5.1,
	longitudeOfAscendingNodeDeg: 0,
	argumentOfPeriapsisDeg: 0,
	meanAnomalyAtEpochDeg: 0,
	axialTiltDeg: 6.7,
	retrogradeRotation: false,
	orbitRange: "middle",
	semiMajorAxisPlanetDiameters: 30.17,
	sizeClass: 2,
}
