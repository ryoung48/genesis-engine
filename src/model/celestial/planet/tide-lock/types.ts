import type {
	TemperatureTraceEntry,
	TideLock,
} from "@/model/celestial/orbit-body/types"

export type TideLockTraceEntry = TemperatureTraceEntry

export interface TideLockEffectResult {
	siderealDayHours: number
	axialTiltDeg: number
	eccentricity: number
	locked: boolean
	trace: TideLockTraceEntry[]
}

export interface PlanetTideLockResult {
	siderealDayHours: number
	axialTiltDeg: number
	eccentricity: number
	tideLock: TideLock | null
	/** True when the result is a 1:1 lock specifically to the star. */
	starLocked: boolean
	/** Ported from galaxy-gen's orbit.rotation.trace -- see OrbitBody.
	 * tideLockTrace's doc for the entry shape/ordering. */
	trace: TideLockTraceEntry[]
}

export interface MoonTideLockResult {
	siderealDayHours: number
	axialTiltDeg: number
	eccentricity: number
	/** True on a full 1:1 lock to the moon's parent planet. */
	locked: boolean
	trace: TideLockTraceEntry[]
}
