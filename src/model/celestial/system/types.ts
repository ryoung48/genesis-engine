import type { MoonBody } from "@/model/celestial/moons/types"
import type { OrbitBody } from "@/model/celestial/orbit-body/types"

export interface RingProfile {
	innerRadiusRelative: number
	outerRadiusRelative: number
	color: number
	opacity: number
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
