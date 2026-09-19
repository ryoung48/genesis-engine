import type { MoonBody } from "@/model/celestial/moons/types"
import type { OrbitBody } from "@/model/celestial/orbit-body/types"

export interface RingProfile {
	innerRadiusRelative: number
	outerRadiusRelative: number
	color: number
	opacity: number
}

// World Builder's Handbook p. 74's Belt Composition Percentages -- m-type
// (metallic), s-type (stony), c-type (icy/carbonaceous), and whatever's left
// over as otherPct once those three are resolved (see ASTEROID_BELT.rollProfile).
export interface BeltComposition {
	mTypePct: number
	sTypePct: number
	cTypePct: number
	otherPct: number
}

// World Builder's Handbook pp. 72-75's full Planetoid Belt Characteristics --
// only set for a SystemBody with group "asteroid belt".
export interface BeltProfile {
	/** Total width of the belt, in Orbit# units, centred on the belt's own
	 * orbitalDistanceAU -- p. 73's Belt Span. */
	spanOrbitNumber: number
	composition: BeltComposition
	/** Relative factor for the volume of bodies comprising the belt -- p. 73's
	 * Belt Bulk. Always at least 1. */
	bulk: number
	/** 2-12 -- p. 73's Belt Resource Rating. */
	resourceRating: number
}

// Not a World Builder's Handbook mechanic -- a homebrew proxy for how exposed
// a body is to asteroid/planetoid bombardment, layering the book's own
// belt-bulk factor (more material in the belt) onto orbital proximity
// (closer to the belt, more of its debris crosses this body's path). See
// IMPACT_EXPOSURE.computeForBody. Not set for a body with group "asteroid
// belt" itself.
export interface ImpactExposure {
	/** Orbit# distance to the nearest planetoid belt in the system -- null
	 * when the system has no belts at all. */
	nearestBeltOrbitNumberDistance: number | null
	/** nearestBelt.bulk / (1 + nearestBeltOrbitNumberDistance) -- unitless,
	 * relative to other bodies in the same generated galaxy only. 0 when the
	 * system has no belts. */
	score: number
}

type GeneratedBodyFields =
	| "sizeClass"
	| "density"
	| "group"
	| "classification"
	| "atmosphere"
	| "siderealDayHours"
	| "longitudeOfPerihelionDeg"
	| "lsAphelionDeg"
	| "axialTiltDeg"
	| "inclinationDeg"
	| "longitudeOfAscendingNodeDeg"

export type SystemBody = Omit<OrbitBody, GeneratedBodyFields> &
	Required<Pick<OrbitBody, GeneratedBodyFields>> & {
		/** Stable identifier for this body within the system -- the main world is
		 * always -1; siblings/preset planets get non-negative indices. Lets a
		 * moon's tideLock reference "my parent" without embedding an object
		 * reference. See attachParentTideLocks. */
		seed: string
		/** Jovians roll rings; eligible non-jovian planets have a 1-in-100
		 * minor-ring chance. [JUSTIFICATION] Optional because ringless planets
		 * have no geometry to render; moons never receive this field. */
		rings?: RingProfile
		isMainWorld: boolean
		orbitalDistanceAU: number
		/** 0 / unused for asteroid belts. */
		/** 0 / unused for asteroid belts. */
		/** 0 / unused for asteroid belts. */
		gravityG: number
		/** Sidereal rotation period (relative to the stars, not the sun) — 0 /
		 * unused for asteroid belts. */
		/** Longitude of perihelion, in degrees. */
		/** 0 / unused for asteroid belts. */
		/** Orbital inclination, in degrees — see rollInclinationDeg. */
		/** Longitude of the ascending node, in degrees — where the orbit crosses
		 * the reference (equatorial) plane heading "north". No existing table to
		 * port for this, so it's just a uniform 0–360° roll like the moons use. */
		moons: MoonBody[]
		/** EBM internalHeatTempK (residual/formation heat), relevant for gas
		 * giants — see sol-system.ts's SolPlanetSeed.greenhouseFactor doc.
		 * Unset (no known excess) for everything else. */
		internalHeatTempK?: number
		/** Main-world-only terrain generation controls. */
		landDistribution?: number
		continentSizeVariety?: number
		seaLevel?: number
		maxElevation?: number
		/** True for a body sharing another body's Orbit# 60° ahead (leading) or
		 * behind (trailing) it, Lagrange-point style -- see generateSystemBodies'
		 * trojan roll. Set so trojan worlds are easy to find later. */
		trojan?: boolean
		/** +60 (trailing) or -60 (leading) -- only set when trojan is true. */
		trojanOffsetDeg?: number
		/** idx of the body this trojan shares its Orbit# with -- only set when
		 * trojan is true. Lets the renderer place this body 60° from that body
		 * on a shared orbit instead of its own independent ring. */
		trojanOfIdx?: number
		/** idx of the asteroid-belt body this orbits inside of -- a real
		 * planet-class body (its own stats/wiki card, group "dwarf"), NOT a
		 * moon of the belt and NOT a trojan (no fixed ±60° offset, no "Trojan
		 * Orbit" circumstance tag). Lets the renderer place it on the belt's own
		 * ring radius instead of its own independently packed orbit slot. See
		 * Ceres/Pallas in sol-system/data/index.ts. */
		beltOfIdx?: number
		/** Only set for group "asteroid belt" -- see BeltProfile. */
		belt?: BeltProfile
		/** True for World Builder's Handbook p. 226's primordial-system "extra
		 * co-orbital planet" -- a fully independent body (its own size/
		 * classification/eccentricity, not a beltOfIdx resident and not a
		 * trojan) sharing its host slot's basic orbit via spread variance. Set
		 * so these are easy to find later, the same reason `trojan` exists. */
		coOrbital?: boolean
		/** Not set for group "asteroid belt" itself -- see ImpactExposure. */
		impactExposure?: ImpactExposure
	}

import type {
	HostStarAttributes,
	SpectralClass,
} from "@/model/celestial/star/types"

/** A companion star bound to another star in the same system -- see
 * GALAXY_SYSTEMS.rollStarTree. Structurally the same "a star with its own
 * orbiting bodies" shape as the top-level `star`/`orbits` pair; kept as a
 * separate array (rather than folded into `orbits`) since a companion is a
 * star, not a SystemBody -- it has no diameter/mass/classification/etc. of
 * its own planet-shaped fields, just its own class/subtype/seed and its own
 * orbiting bodies. [JUSTIFICATION] Absent for a single-star system -- every
 * existing session (including Sol) has no companions, so this field being
 * empty/absent is the common case, not the exception. */
export interface CompanionStar {
	class: SpectralClass
	subtype: number
	/** The companion's original galaxy profile. [JUSTIFICATION] Authored
	 * single-system companions do not have a separately rolled profile. */
	hostStar?: HostStarAttributes
	seed: string
	starName: string
	/** How this star relates to the star it orbits -- mirrors
	 * GALAXY_SYSTEMS' StarRole minus "primary" (only the root star has no
	 * parent). */
	role: "epistellar" | "inner" | "outer" | "distant"
	/** Distance from the star it orbits, using that parent's own
	 * habitable-zone deviation-to-AU mapping -- see GalaxyStar's doc. */
	orbitalDistanceAU: number
	/** Kepler period around its parent. */
	orbitalPeriodDays: number
	/** Orbital eccentricity around the parent star. */
	eccentricity: number
	/** Orbital inclination around the parent star. */
	inclinationDeg: number
	orbits: SystemBody[]
}

export interface SolarSystemState {
	star: {
		class: SpectralClass
		subtype: number
		seed: string
		/** The original galaxy host's physical profile. [JUSTIFICATION] Authored
		 * single-system states expose only class/subtype and therefore have no
		 * rolled profile to retain. */
		hostStar?: HostStarAttributes
		/** Same shape as class/subtype: the live, authoritative value -- built
		 * once at initialization (STAR_IDENTITY.getStarAgeGyr's Sol-relative
		 * default, or the real hostStar.ageGyr for a galaxy-opened system), then
		 * read directly everywhere. setStarSpectralClass/setStarSubtype re-clamp
		 * it to the new class/subtype's main-sequence-lifespan bounds when they
		 * run (see useSolarSystemBodies.ts) so it never goes stale/invalid the
		 * way a derived-on-read value couldn't. Editable for every star except
		 * Sol, whose age is a fixed real value. */
		ageGyr: number
	}
	orbits: SystemBody[]
	companionStars?: CompanionStar[]
}
