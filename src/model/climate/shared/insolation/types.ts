export interface InsolationComputeParams {
	lats: number[]
	orbital: OrbitalParams
	// [JUSTIFICATION] Standard world generation uses the built-in 365-sample year.
	sampleCount?: number
	// [JUSTIFICATION] Standard world generation uses its existing calendar epoch.
	startSolarLongitudeDegrees?: number
	// [JUSTIFICATION] Defaults to the Sun at 1 AU.
	stellarOverride?: StellarParams
}

export interface OrbitalParams {
	OBLIQUITY: number
	ECCENTRICITY: number
	PERIHELION: number
}

export interface StellarParams {
	T_SUN: number
	R_SUN: number
	AU: number
	SIGMA: number
}
