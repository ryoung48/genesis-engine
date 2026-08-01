export type OrbitGroup =
	| "asteroid belt"
	| "dwarf"
	| "terrestrial"
	| "helian"
	| "jovian"

export type OrbitClassification =
	| "acheronian"
	| "arid"
	| "asphodelian"
	| "asteroid"
	| "asteroid belt"
	| "chthonian"
	| "geo-cyclic"
	| "geo-tidal"
	| "hebean"
	| "helian"
	| "jani-lithic"
	| "jovian"
	| "meltball"
	| "oceanic"
	| "panthalassic"
	| "rockball"
	| "snowball"
	| "stygian"
	| "tectonic"
	| "telluric"
	| "vesperian"

export interface DensityProfile {
	earthRelative: number
	description: string
}

export interface DensityFromMassAndDiameterInput {
	massKg: number
	diameterKm: number
}

export interface MassFromDensityInput {
	diameterKm: number
	densityEarthRelative: number
}

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
	/** Only atmosphere types with pressure/composition variants set this. */
	subtype?:
		| "very thin"
		| "thin"
		| "standard"
		| "dense"
		| "very dense"
		| "unusual"
		| "helium"
		| "hydrogen"
	/** Set only for otherwise-breathable/exotic profiles with contaminants. */
	tainted?: boolean
	/** Set only when the atmosphere table assigns a specific named hazard. */
	hazard?: string
	breathable: boolean
}

export type OrbitChemistry =
	| "water"
	| "ammonia"
	| "methane"
	| "sulfur"
	| "chlorine"

export type OrbitComposition = "rocky" | "ice" | "metallic" | "gas"
type OrbitZone = "epistellar" | "inner" | "outer"

interface HydrosphereSurfaceComponent {
	pct: number
	/** Major and minor regions get a rolled body count; small regions are
	 * aggregate coverage below the named-body threshold and never do. */
	count?: number
}

export interface HydrosphereProfile {
	code: number
	distribution: number
	surface: {
		land: {
			major: HydrosphereSurfaceComponent & { count: number }
			minor: HydrosphereSurfaceComponent & { count: number }
			small: HydrosphereSurfaceComponent
		}
		water: {
			major: HydrosphereSurfaceComponent & { count: number }
			minor: HydrosphereSurfaceComponent & { count: number }
			small: HydrosphereSurfaceComponent
		}
	}
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
	/** Theoretical-max equilibrium surface tide (see computeSurfaceTidesM /
	 * computeMoonSurfaceTidesM in climate/tidal-schedule.ts), folded into
	 * totalHeating/regime alongside residual and tidal heating -- 0 when the
	 * caller didn't supply a surface-tides callback (see
	 * applySystemSeismology's getSurfaceTidesHeatingForBody/Moon params). */
	surfaceTidesHeating: number
	totalHeating: number
	regime: "dead" | "low" | "active" | "extreme"
}

// Fields shared by every orbiting body in the system, whether it's a planet
// (SystemBody, in system/generate-system-bodies.ts) or a moon (MoonBody, in
// moons/moon-types.ts) -- physical/orbital data that means the same thing on
// both. Fields are optional here even where a given subtype always supplies
// them (e.g. SystemBody re-declares density/group/classification/atmosphere
// as required); fields that only make sense for one kind of body (a planet's
// moons/rings/orbitalDistanceAU/gravityG, a moon's orbitRange/
// semiMajorAxisPlanetDiameters/meanAnomalyAtEpochDeg) live on the specific
// interface instead, not here. This is the dependency-free leaf of the
// celestial model -- it must not import from moon-types.ts or any system/*
// file, both of which import from here.
export interface OrbitBody {
	idx: number
	/** Procedural and named bodies gain this during system generation; partial
	 * construction records and anonymous belts can remain unnamed. */
	name?: string
	massKg: number
	diameterKm: number
	/** These classification outputs are absent on partial bodies before the
	 * system/moon environment pass; SystemBody narrows its required subset. */
	sizeClass?: number
	density?: DensityProfile | null
	group?: OrbitGroup
	zone?: OrbitZone
	classification?: OrbitClassification
	subtype?: string
	composition?: OrbitComposition
	chemistry?: OrbitChemistry
	hydrosphereCode?: number
	hydrosphere?: HydrosphereProfile
	/** Fraction of surface covered by land, 0..1 */
	landCoverage: number
	atmosphere?: AtmosphereProfile | null
	/** Real photographic texture -- authored directly on Sol's named bodies in
	 * sol-system.ts; a procedurally-generated body falls back to a generic
	 * shared texture/color. */
	texturePath?: string
	/** Optional separate cloud-layer texture, rendered as a slightly larger
	 * transparent sphere over the surface texture -- only Earth has one
	 * authored today. */
	cloudsTexturePath?: string
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
	/**
	 * EBM seasonal-insolation perihelion input, in degrees -- NOT the same
	 * quantity as longitudeOfPerihelionDeg above. insolation/index.ts's
	 * orbital.PERIHELION is (Ls_at_perihelion - 180), i.e. Ls (the body's own
	 * areocentric/heliocentric solar longitude, 0 = the body's own vernal
	 * equinox) at APHELION -- not the fixed-frame longitude of perihelion
	 * used to orient the 3D orbit. These angles use different reference frames
	 * and must be authored independently. Falls back to
	 * longitudeOfPerihelionDeg when unset for generated bodies without a
	 * seasonal reference value.
	 */
	lsAphelionDeg?: number
	axialTiltDeg: number
	/** Bond albedo, 0..1 — real measured value where known, otherwise unset. */
	albedo?: number
	/** EBM greenhouseFactor — real fitted value for a known Sol body (see
	 * sol-system.ts), or dice-rolled at generation time for a procedural one
	 * (see greenhouse-estimate.ts's rollGreenhouseFactor). Legacy bodies may
	 * still omit it; treat that as 0. */
	greenhouseFactor?: number
	/** What (if anything) this body is tidally locked to. */
	tideLock?: TideLock | null
	/** Explicit rotation/resonance descriptor, derived from siderealDayHours
	 * vs. orbitalPeriodDays (see tide-lock.ts's deriveTideLockStatus) --
	 * "1:1" whenever tideLock is set, "3:2" for a spin-orbit resonance like
	 * real Mercury's (day exactly 2/3 or 3/2 of the year, tideLock stays
	 * null), undefined otherwise. The UI shows this descriptor when set, and
	 * falls back to a plain prograde/retrograde read off axialTiltDeg when
	 * it isn't -- see GenerationPanel.tsx's buildTideLockStat. */
	tideLockStatus?: "1:1" | "3:2"
	/** Longitude of the substellar point (the spot on the surface directly
	 * facing the star), in degrees 0-360 — only meaningful when tideLock is
	 * set. Defaults to 0° when unset. */
	substellarLon?: number
	/** Unset until applySystemSeismology runs after bodies and moon orbits
	 * have been assembled. */
	seismology?: SeismologyProfile
	/** Terrain-generation controls -- only ever supplied for the main world's
	 * planet card, but live here (rather than only on SystemBody) since
	 * nothing else about them is planet- vs moon-specific. */
	landDistribution?: number
	continentSizeVariety?: number
	seaLevel?: number
	maxElevation?: number
}
