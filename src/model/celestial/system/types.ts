import type { MoonBody } from "../moons"
import type {
	AtmosphereProfile,
	OrbitBody,
	OrbitClassification,
	OrbitGroup,
} from "../orbit-body"

export interface RingProfile {
	innerRadiusRelative: number
	outerRadiusRelative: number
	color: number
	opacity: number
}

export interface SystemBody extends OrbitBody {
	/** Stable identifier for this body within the system -- the main world is
	 * always -1; siblings/preset planets get non-negative indices. Lets a
	 * moon's tideLock reference "my parent" without embedding an object
	 * reference. See attachParentTideLocks. */
	seed: string
	sizeClass: number
	density: import("../orbit-body").DensityProfile | null
	group: OrbitGroup
	classification: OrbitClassification
	/** Only jovians roll a ring geometry; all other bodies are ringless. */
	rings?: RingProfile
	atmosphere: AtmosphereProfile | null
	isMainWorld: boolean
	orbitalDistanceAU: number
	/** 0 / unused for asteroid belts. */
	diameterKm: number
	/** 0 / unused for asteroid belts. */
	massKg: number
	/** 0 / unused for asteroid belts. */
	gravityG: number
	/** Sidereal rotation period (relative to the stars, not the sun) — 0 /
	 * unused for asteroid belts. */
	siderealDayHours: number
	/** Longitude of perihelion, in degrees. */
	longitudeOfPerihelionDeg: number
	/** 0 / unused for asteroid belts. */
	axialTiltDeg: number
	/** Orbital inclination, in degrees — see rollInclinationDeg. */
	inclinationDeg: number
	/** Longitude of the ascending node, in degrees — where the orbit crosses
	 * the reference (equatorial) plane heading "north". No existing table to
	 * port for this, so it's just a uniform 0–360° roll like the moons use. */
	longitudeOfAscendingNodeDeg: number
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

import type { MainSequenceClass } from "../star"

export interface SolarSystemState {
	star: {
		class: MainSequenceClass
		subtype: number
		seed: string
	}
	orbits: SystemBody[]
}
