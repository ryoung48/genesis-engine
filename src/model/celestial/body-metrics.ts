export const EARTH_DIAMETER_KM = 12_742
export const SOLAR_DIAMETER_KM = 1_391_400
const EARTH_MASS_KG = 5.973886146404331e24
const GRAVITATIONAL_CONSTANT = 6.674e-11
const STANDARD_GRAVITY_MS2 = 9.807

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

export function computeGravityG(massKg: number, diameterKm: number): number {
	const radiusM = (diameterKm / 2) * 1000
	return (GRAVITATIONAL_CONSTANT * massKg) / radiusM ** 2 / STANDARD_GRAVITY_MS2
}
