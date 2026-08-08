import type { MoonBody } from "@/model/celestial/moons/types"
import type {
	AtmosphereProfile,
	TideLock,
} from "@/model/celestial/orbit-body/types"
import type { MainSequenceClass } from "@/model/celestial/star/types"

/** Inputs used to hydrate the authored Sol main world or a generated world. */
export interface HomeWorldParams {
	/** The procedural main world is named after construction; Sol supplies
	 * Earth's authored name. */
	name?: string
	orbitalDistanceAU: number
	diameterKm: number
	moons: MoonBody[]
	massKg: number
	gravityG: number
	siderealDayHours: number
	eccentricity: number
	/** Only real Sol data supplies this stable orbital element. */
	longitudeOfPerihelionDeg?: number
	/** EBM seasonal-insolation input, in the body's Ls frame. */
	lsAphelionDeg: number
	axialTiltDeg: number
	/** Only real Sol data supplies this stable orbital element. */
	inclinationDeg?: number
	/** Usually absent because a newly generated main world starts unlocked. */
	tideLock?: TideLock | null
	/** Meaningful only for a supplied tide lock. */
	substellarLon?: number
	/** A live UI atmosphere is absent until the user has authored one. */
	atmosphere?: AtmosphereProfile | null
	/** Terrain controls are absent until the main-world editor supplies them. */
	landDistribution?: number
	landCoverage?: number
	continentSizeVariety?: number
	seaLevel?: number
	maxElevation?: number
	/** Real fitted values are only supplied when generating the real Sol seed's
	 * Earth. */
	albedo?: number
	greenhouseFactor?: number
}

export interface GenerateSystemBodiesParams {
	seed: number
	/** Overrides the traditional G2V Sol-equivalent star every generated
	 * system otherwise gets -- omit for that default. */
	spectralClass?: MainSequenceClass
	starSubtype?: number
	/** Whether to reserve the temperate deviation-0 slot for a main world. */
	forceMainWorld: boolean
	/** Only consulted for the real Sol seed; ignored for other seeds. */
	solMainWorldOverrides?: HomeWorldParams
}
