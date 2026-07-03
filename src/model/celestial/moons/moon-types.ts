export type MoonOrbitRange = "inner" | "middle" | "outer" | "extreme"

export type PlanetType = "terrestrial" | "gas-giant-moon"

export interface MoonParams {
	idx: number
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

export type TideLock = { type: "solar" | "lunar"; target: number }

export const MAX_MOONS = 3

export const MOON_DEFAULTS: MoonParams = {
	idx: 1,
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

// ── Gas giant system ──────────────────────────────────────────────────────────

/** Size class 16, 17, or 18 (galaxy-gen jovian scale). */
export type GasGiantSizeClass = 16 | 17 | 18

export interface GasGiantParams {
	sizeClass: GasGiantSizeClass
	/** Diameter in km. */
	diameterKm: number
	/** Diameter in Earth diameters (used for orbital mechanics formulae). */
	diameterEarths: number
	/** Mass in Earth masses. */
	massEarths: number
	massKg: number
	/** Surface gravity in g. */
	gravityG: number
	/** Density in Earth-relative units (mass / diameter³). */
	density: number
	/** Day length in hours. */
	dayLengthHours: number
}

export interface GasGiantMoonParams {
	/** 2-based idx in the system (main planet = 1, gas giant = 0). */
	idx: number
	/** Galaxy-gen size class 0–10. */
	sizeClass: number
	diameterKm: number
	massKg: number
	massEarths: number
	gravityG: number
	orbitalPeriodDays: number
	/** Semi-major axis in gas-giant diameters. */
	pd: number
	orbitRange: MoonOrbitRange
	inclinationDeg: number
	eccentricity: number
	axialTiltDeg: number
	retrogradeRotation: boolean
	longitudeOfAscendingNodeDeg: number
	argumentOfPeriapsisDeg: number
	meanAnomalyAtEpochDeg: number
}

export interface GasGiantSystem {
	gasGiant: GasGiantParams
	/** Semi-major axis of the main planet around the gas giant, in gas-giant diameters. */
	mainMoonPd: number
	/** Orbital period of the main planet around the gas giant, in days. */
	mainMoonOrbitalPeriodDays: number
	mainMoonOrbitRange: MoonOrbitRange
	mainMoonInclinationDeg: number
	mainMoonEccentricity: number
	mainMoonAxialTiltDeg: number
	mainMoonRetrogradeRotation: boolean
	mainMoonLongitudeOfAscendingNodeDeg: number
	mainMoonArgumentOfPeriapsisDeg: number
	mainMoonMeanAnomalyAtEpochDeg: number
	/** All other moons of the gas giant (excludes the main planet). */
	siblingMoons: GasGiantMoonParams[]
}
