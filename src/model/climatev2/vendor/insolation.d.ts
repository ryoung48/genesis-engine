export interface LockedSpin {
	substellarLon: number
	libration: number[]
	declination: number[]
	flux: number[]
}

export interface ClimateOrbit {
	tiltDeg: number
	eccentricity: number
	perihelion: number
	rotationRateRadS: number
	yearScale: number
	solarDayScale: number
	sunScale: number
	radiusScale: number
	gravityScale: number
	pressureScale: number
	locked: LockedSpin | null
}

export const EARTH_ROTATION: number
export function orbitOf(
	options: Record<string, unknown> | undefined,
): ClimateOrbit & { rotation: number }
export function lockedSunAt(
	latDeg: ArrayLike<number>,
	lonDeg: ArrayLike<number>,
	orbit: ClimateOrbit,
	t: number,
	q: Float64Array,
	mu: Float64Array | null,
): void
