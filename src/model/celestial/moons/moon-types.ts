export type MoonOrbitRange = "inner" | "middle" | "outer" | "extreme"

export type PlanetType = "terrestrial"

export interface AtmosphereProfile {
	code: number
	pressureBar: number
	type:
		| "vacuum"
		| "trace"
		| "breathable"
		| "exotic"
		| "corrosive"
		| "insidious"
		| "gas"
	subtype?:
		| "very thin"
		| "thin"
		| "standard"
		| "dense"
		| "very dense"
		| "unusual"
		| "helium"
		| "hydrogen"
	tainted?: boolean
	hazard?: string
	breathable: boolean
}

export interface MoonParams {
	idx: number
	massKg: number
	diameterKm: number
	sizeClass?: number
	densityEarthRelative?: number
	densityDescription?: string
	group?: "asteroid belt" | "dwarf" | "terrestrial" | "helian" | "jovian"
	classification?: string
	hydrosphereFraction?: number
	atmosphere?: AtmosphereProfile
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
