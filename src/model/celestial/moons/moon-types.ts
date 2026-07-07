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

export interface SeismologyProfile {
	residualHeating: number
	tidalHeating: number
	/** Theoretical-max equilibrium surface tide, folded into totalHeating/
	 * regime alongside residual and tidal heating -- see the identically-
	 * shaped SeismologyProfile in system/system-seismology.ts (the actual
	 * producer of this data; duplicated here rather than imported to avoid a
	 * moon-types.ts -> system-seismology.ts dependency from this low-level
	 * shared-types file). */
	surfaceTidesHeating: number
	totalHeating: number
	regime: "dead" | "low" | "active" | "extreme"
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
	/** Longitude of the substellar point (the spot on the surface directly
	 * facing the star), in degrees 0-360 — only meaningful when tideLock is
	 * set. Defaults to 0° when unset. */
	substellarLon?: number
	seismology?: SeismologyProfile
}

export const MAX_MOONS = 3

// Fallback for any moon that doesn't get a rolled/authored atmosphere of its
// own (see generateMoons() and sol-system.ts's SolMoonSeed table) -- most
// moons in reality are airless, and an explicit vacuum profile keeps the
// stats card's Atmosphere row from silently disappearing (the row is only
// omitted when `atmosphere` is `undefined`, not when it's vacuum).
export const DEFAULT_MOON_ATMOSPHERE: AtmosphereProfile = {
	code: 0,
	pressureBar: 0,
	type: "vacuum",
	breathable: false,
}
