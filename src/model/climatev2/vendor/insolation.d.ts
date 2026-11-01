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
