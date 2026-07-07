export const EARTH_DIAMETER_KM = 12_742
export const SOLAR_DIAMETER_KM = 1_391_400
const EARTH_MASS_KG = 5.973886146404331e24

export function computeEarthRelativeDensity(
	massKg: number,
	diameterKm: number,
): number {
	const diameterEarths = diameterKm / EARTH_DIAMETER_KM
	const massEarths = massKg / EARTH_MASS_KG
	return massEarths / diameterEarths ** 3
}

export function massKgFromEarthRelativeDensity(
	diameterKm: number,
	densityEarthRelative: number,
): number {
	const diameterEarths = diameterKm / EARTH_DIAMETER_KM
	const massEarths = densityEarthRelative * diameterEarths ** 3
	return massEarths * EARTH_MASS_KG
}

// Relative to Earth (g/g⊕ = (M/M⊕) / (R/R⊕)²) rather than derived from
// absolute physical constants (G, standard gravity) -- G cancels out of the
// ratio entirely, so this is exact for any body instead of drifting off
// 1.000g at Earth's own defaults the way a G/g0-based computation would
// (see derivePlanetMassKg's EARTH_DENSITY_KG_M3 for the mass side of the
// same problem).
export function computeGravityG(massKg: number, diameterKm: number): number {
	const massEarths = massKg / EARTH_MASS_KG
	const diameterEarths = diameterKm / EARTH_DIAMETER_KM
	return massEarths / diameterEarths ** 2
}
