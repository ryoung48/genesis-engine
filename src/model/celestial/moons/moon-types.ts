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

// "solar": locked to the star. "lunar": locked to one of this body's own
// moons (target = that moon's idx). "planet": a moon locked to the planet
// it orbits (target = that planet's SystemBody idx).
export type TideLock = {
	type: "solar" | "lunar" | "planet"
	target: number
}

export interface MoonParams {
	idx: number
	name?: string
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
	/** Sidereal rotation period, in hours — independent of orbitalPeriodDays.
	 * Most moons end up tidally locked (siderealDayHours === orbitalPeriodDays
	 * × 24) simply because that's common in reality, but it's rolled/stored
	 * explicitly rather than assumed. */
	siderealDayHours: number
	eccentricity: number
	inclinationDeg: number
	longitudeOfAscendingNodeDeg: number
	longitudeOfPerihelionDeg: number
	meanAnomalyAtEpochDeg: number
	axialTiltDeg: number
	orbitRange?: MoonOrbitRange
	semiMajorAxisPlanetDiameters?: number
	/** Bond albedo, 0..1 — real measured value where known, otherwise unset. */
	albedo?: number
	/** EBM greenhouseFactor — real fitted value for a known Sol moon (see
	 * sol-system.ts), or dice-rolled at generation time for a procedural one
	 * (see greenhouse-estimate.ts's rollGreenhouseFactor). Legacy moons may
	 * still omit it; treat that as 0. */
	greenhouseFactor?: number
	/** What (if anything) this moon is tidally locked to. Most large moons end
	 * up locked to their parent planet; null when not locked to anything. */
	tideLock?: TideLock | null
	/** Longitude of the antistellar point (the spot on the surface directly
	 * facing away from the star), in degrees 0-360 — only meaningful when
	 * tideLock is set. Defaults to 180° when unset. */
	antistellarLon?: number
}

export const MAX_MOONS = 3
