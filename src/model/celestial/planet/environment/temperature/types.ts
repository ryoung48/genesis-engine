import type {
	OrbitGroup,
	TemperatureEstimate,
	TemperatureTraceEntry as OrbitBodyTemperatureTraceEntry,
	TideLock,
} from "@/model/celestial/orbit-body/types"

export interface OrbitalTemperatureInput {
	orbitalDistanceAU: number
	luminositySol: number
}

export interface TemperatureInput {
	kelvinTemp: number
	luminositySol: number
}

export interface DeviationInput {
	deviation: number
	luminositySol: number
}

/** Ported from galaxy-gen's TEMPERATURE.finalize (orbits/temperature/
 * index.ts) -- everything from step 4 onward (mean/high/low/delta from an
 * already-known albedo/greenhouseFactor). Steps 1-2 (rolling albedo and
 * greenhouseFactor) are NOT ported here since chaos-machine already rolls
 * both, in the same convention, via DENSITY.rollAlbedo and
 * GREENHOUSE_ESTIMATE.rollGreenhouseFactor at classification time -- this
 * takes those as inputs instead of re-deriving them. */
export interface FinalizeTemperatureInput {
	luminositySol: number
	orbitalDistanceAU: number
	/** The parent body's eccentricity for a moon (galaxy-gen's
	 * `parent?.eccentricity ?? orbit.eccentricity`), or the body's own
	 * eccentricity otherwise. */
	eccentricity: number
	albedo: number
	greenhouseFactor: number
	hydrosphereCode: number
	pressureBar: number
	axialTiltDeg: number
	orbitalPeriodDays: number
	siderealDayHours: number
	tideLock?: TideLock | null
	/** SeismologyProfile.totalHeating, on the same Kelvin-equivalent flux
	 * scale as galaxy-gen's seismology.total. */
	seismologyTotal: number
	/** Gates the mean > 1000K boil-off override -- galaxy-gen never forces it
	 * for a jovian. */
	group: OrbitGroup
}

export type TemperatureTraceEntry = OrbitBodyTemperatureTraceEntry

/** Same shape as OrbitBody's TemperatureEstimate (see that file's doc for why
 * it's not imported from here instead). Does NOT include a trace -- see
 * TemperatureTraceResult/TEMPERATURE.trace for the on-demand permutation
 * breakdown. */
export type TemperatureFinalizeResult = TemperatureEstimate

export interface TemperatureTraceResult {
	mean: { baseline: number; trace: TemperatureTraceEntry[] }
	delta: { baseline: number; trace: TemperatureTraceEntry[] }
}
