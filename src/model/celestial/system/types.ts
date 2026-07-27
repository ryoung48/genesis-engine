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
		/** Only jovians roll a ring geometry; all other bodies are ringless. */
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
	}

import type { MainSequenceClass } from "@/model/celestial/star/types"

export interface SolarSystemState {
	star: {
		class: MainSequenceClass
		subtype: number
		seed: string
	}
	orbits: SystemBody[]
}
