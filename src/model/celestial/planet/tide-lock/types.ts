import type { TideLock } from "@/model/celestial/orbit-body/types"

export interface TideLockEffectResult {
	siderealDayHours: number
	axialTiltDeg: number
	eccentricity: number
	locked: boolean
}

export interface PlanetTideLockResult {
	siderealDayHours: number
	axialTiltDeg: number
	eccentricity: number
	tideLock: TideLock | null
	/** True when the result is a 1:1 lock specifically to the star. */
	starLocked: boolean
}

export interface MoonTideLockResult {
	siderealDayHours: number
	axialTiltDeg: number
	eccentricity: number
	/** True on a full 1:1 lock to the moon's parent planet. */
	locked: boolean
}
