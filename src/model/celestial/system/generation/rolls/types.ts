import type {
	OrbitClassification,
	OrbitGroup,
} from "@/model/celestial/orbit-body/types"
import type { RNG } from "@/model/shared/random/rng"

// Book's Terrestrial Composition table (p. 71-72) -- these six categories,
// not this codebase's own climate/physical Classification, are what the
// Terrestrial Density table (p. 72) is actually keyed by.
export type TerrestrialCompositionCategory =
	| "Exotic Ice"
	| "Mostly Ice"
	| "Mostly Rock"
	| "Rock and Metal"
	| "Mostly Metal"
	| "Compressed Metal"

export interface RollTerrestrialCompositionInput {
	rng: ReturnType<typeof RNG.createRng>
	sizeClass: number
	orbitalDistanceAU: number
	luminositySol: number
	starAgeGyr: number
}

export interface PickDensityEarthRelativeInput {
	rng: ReturnType<typeof RNG.createRng>
	group: OrbitGroup
	classification: OrbitClassification
	sizeClass: number
	orbitalDistanceAU: number
	luminositySol: number
	starAgeGyr: number
}

export type EccentricityOrbitKind = "planet" | "companion-star"

export interface RollEccentricityInput {
	rng: ReturnType<typeof RNG.createRng>
	orbitKind: EccentricityOrbitKind
	/** [JUSTIFICATION] Only meaningful for orbitKind "companion-star" -- the
	 * book's "for each star an object directly orbits beyond the first"
	 * eccentricity DM (p. 27-28): 0 for a companion whose parent is the
	 * system's primary, 1 for a companion nested one level deeper (an
	 * epistellar companion of a non-primary star). A planet has no
	 * equivalent nesting in this repo's model, so it's always 0/omitted. */
	starsOrbitedBeyondFirst?: number
	/** [JUSTIFICATION] Only meaningful for orbitKind "companion-star" -- the
	 * book's "Orbit#s below 1.0 if System Age greater than 1 Gyr" DM-1 (p.
	 * 27), which circularizes old, tight binary orbits; a planet's own
	 * eccentricity DM table (Step 9, p. 52) has no matching clause here. */
	oldTightOrbit?: boolean
	/** [JUSTIFICATION] Only set for a Stage 7 anomalous slot -- the book's
	 * Anomalous Orbit Type table DM (p. 50-51): +2 for random/inclined/
	 * retrograde, +5 for eccentric. Omitted for an ordinary planet. */
	anomalyEccentricityDM?: number
}

export interface RollAnomalousInclinationDegInput {
	rng: ReturnType<typeof RNG.createRng>
}

export interface RollPlanetRingsInput {
	rng: ReturnType<typeof RNG.createRng>
	group: OrbitGroup
}
