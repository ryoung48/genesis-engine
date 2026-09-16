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

export interface SizeClassToDiameterRangeInput {
	sizeClass: number
}

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
	/** Set only when subtype is "unusual" (code 15 / "F") -- the specific
	 * flavour of the anomaly, ported from galaxy-gen's Atmosphere.unusual. */
	unusual?:
		| "ellipsoid"
		| "layered"
		| "high radiation"
		| "steam"
		| "storms"
		| "tides"
		| "seasonal"
	/** Set only for otherwise-breathable/exotic profiles with contaminants. */
	tainted?: boolean
	/** Set only when the atmosphere table assigns a specific named hazard --
	 * see ATMOSPHERE.rollHazard (ported from galaxy-gen's ATMOSPHERE.taint). */
	hazard?:
		| "biologic"
		| "radioactive"
		| "gas mix"
		| "low oxygen"
		| "high oxygen"
		| "particulates"
		| "sulphur compounds"
	breathable: boolean
}

export type OrbitChemistry =
	| "water"
	| "ammonia"
	| "methane"
	| "sulfur"
	| "chlorine"

export type OrbitComposition = "rocky" | "ice" | "metallic" | "gas"
export type OrbitZone = "epistellar" | "inner" | "outer"

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

export interface TemperatureTraceEntry {
	value: number
	description: string
}

// Kept local to this dependency-free leaf rather than imported from
// environment/temperature/types.ts's TemperatureFinalizeResult (which itself
// imports OrbitGroup/TideLock from here) -- see this file's own doc comment
// on staying import-free. Structurally identical to that type.
export interface TemperatureEstimate {
	mean: number
	high: number
	low: number
	/** high - low, in Kelvin -- galaxy-gen's finalize delta.value. */
	deltaK: number
	boiledOffHydrosphereCode?: number
	/** NOT computed by TEMPERATURE.finalize -- the permutation-based
	 * contribution breakdown (5!+6! orderings) was expensive enough to slow
	 * down bulk galaxy generation when run for every body/moon eagerly. Call
	 * TEMPERATURE.trace(...) on demand instead (e.g. from a UI detail panel)
	 * if this is ever needed. */
}

// Kept local for the same reason as TemperatureEstimate above -- structurally
// identical to biosphere/types.ts's BiosphereProfile.
export interface BiosphereProfile {
	code: number
	trace: TemperatureTraceEntry[]
	label?: "remnants" | "engineered" | "miscible" | "hybrid" | "immiscible"
}

export interface CloudCoverProfile {
	coverFraction: number
	description: string
}

// Kept local for the same reason as TemperatureEstimate/BiosphereProfile
// above -- structurally identical to planet/light/types.ts's LightProfile.
export interface LightProfile {
	irradianceRelativeToEarth: number
	apparentMagnitude: number
	effectiveApparentMagnitude: number
	poorlyLit: boolean
	looksDark: boolean
}

// Kept local for the same reason as TemperatureEstimate/BiosphereProfile
// above -- structurally identical to planet/weather/types.ts's
// WeatherProfile. See planet/weather's own doc for what's deliberately
// excluded and why.
export interface WeatherProfile {
	stormHazard: boolean
	/** Relative to Earth's own ~10 km/h global-mean near-surface wind speed
	 * (real climatological baseline, not a book or blog-post figure). */
	windSpeedRelative: number
	windSpeedKmh: number
	/** Dynamic-pressure-style force (density x velocity^2, using pressureBar
	 * as the density proxy), relative to Earth. Undefined for a jovian: it
	 * has no solid surface for wind to push against, so "force" has no
	 * meaningful reference point the way it does for a rocky world. */
	windForce?: number
	/** windSpeedKmh crosses the real Beaufort "Gale" threshold (~62 km/h).
	 * Undefined for a jovian: every real gas giant is already extreme by
	 * this standard (Jupiter alone is hundreds of km/h), so the flag can't
	 * meaningfully discriminate within that group the way it can for a
	 * rocky world -- same exclusion pattern as windForce. */
	strongWinds?: boolean
}

export interface MagneticFieldProfile {
	/** 1.0 == Earth's own field strength, under magnetic-field/index.ts's
	 * calibration. */
	fieldIndex: number
	description: string
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
	/** True when this orbit slot was one of the star's own innermost few before
	 * it evolved/collapsed (see PLANET.classifyBody's impactZone doc) -- kept
	 * on the body after classification (rather than only threaded through as a
	 * transient param) so later passes, like BIOSPHERE, can read it without
	 * re-deriving it from classification. A moon inherits its parent planet's
	 * value unchanged. Absent for a hand-authored/incomplete body. */
	impactZone?: boolean
	/** True when this body's orbit (accounting for eccentricity) overlaps any
	 * planetoid belt's span in the system -- see ASTEROID_BELT.crossesAnyBelt.
	 * Not set for a body with group "asteroid belt" itself. A moon inherits
	 * its parent planet's value unchanged, since it shares its parent's
	 * star-orbit rather than having its own. Absent for a hand-authored/
	 * incomplete body. */
	asteroidImpacts?: boolean
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
	/** Ported from galaxy-gen's orbit.rotation.trace -- the DM breakdown (each
	 * modifier's value/description, e.g. "Planet size (4)", "Eccentric (0.3)")
	 * plus the final 2d6+dm base-roll entry, in the order they were applied by
	 * tide-lock.ts's rollPlanetTideLock/rollMoonTideLock. Empty for an asteroid
	 * belt (never rolled) or a body generated before this field existed. */
	tideLockTrace?: TemperatureTraceEntry[]
	/** Longitude of the substellar point (the spot on the surface directly
	 * facing the star), in degrees 0-360 — only meaningful when tideLock is
	 * set. Defaults to 0° when unset. */
	substellarLon?: number
	/** Unset until applySystemSeismology runs after bodies and moon orbits
	 * have been assembled. */
	seismology?: SeismologyProfile
	/** [JUSTIFICATION] Computed alongside seismology, once density/mass/
	 * siderealDayHours are known -- unset until applySystemSeismology runs. */
	magneticField?: MagneticFieldProfile
	/** [JUSTIFICATION] Computed alongside seismology, once landCoverage/
	 * atmosphere/temperatureEstimate are known -- unset until
	 * applySystemSeismology runs. */
	cloudCover?: CloudCoverProfile
	/** [JUSTIFICATION] Computed alongside seismology, once cloudCover and
	 * temperatureEstimate are known -- unset until applySystemSeismology
	 * runs. */
	light?: LightProfile
	/** [JUSTIFICATION] Computed alongside seismology -- unset until
	 * applySystemSeismology runs. */
	weather?: WeatherProfile
	/** Ported from galaxy-gen's TEMPERATURE.finalize -- a closed-form mean/
	 * high/low estimate computed right after seismology.totalHeating is
	 * known (see system-seismology.ts's applyBodySeismology/
	 * applyMoonSeismology), in Kelvin. This is a cheap worldbuilder estimate,
	 * not the full spatial EBM solve (see climate/temperature/ebm) -- unset
	 * until applySystemSeismology runs, same as seismology above. */
	temperatureEstimate?: TemperatureEstimate
	/** Ported from galaxy-gen's BIOSPHERE.get -- computed alongside
	 * temperatureEstimate, right after seismology.totalHeating is known, since
	 * it depends on temperatureEstimate.mean. Only `get` is ported (not
	 * biomass/complexity/diversity/compatibility). */
	biosphere?: BiosphereProfile
	/** Ported from galaxy-gen's DESIRABILITY.habitability -- computed alongside
	 * biosphere, right after seismology.totalHeating and temperatureEstimate
	 * are known, since it depends on both plus gravityG/hydrosphereCode/
	 * atmosphere. Structurally identical to BiosphereProfile (code + trace),
	 * so it's typed with the same interface rather than a separate one. */
	habitability?: BiosphereProfile
	/** Terrain-generation controls -- only ever supplied for the main world's
	 * planet card, but live here (rather than only on SystemBody) since
	 * nothing else about them is planet- vs moon-specific. */
	landDistribution?: number
	continentSizeVariety?: number
	seaLevel?: number
	maxElevation?: number
}

export interface AUToOrbitNumberInput {
	au: number
}

export interface OrbitNumberToAUInput {
	orbitNumber: number
}

export interface HillSphereInput {
	planetOrbitalDistanceM: number
	planetMassKg: number
	starMassKg: number
}

export interface SeasonalTiltFactorInput {
	axialTiltDeg: number
	orbitalPeriodDays: number
}
