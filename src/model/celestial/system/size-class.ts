const EARTH_DIAMETER_KM = 12_742

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

export function estimateRockySizeClass(diameterKm: number): number {
	if (diameterKm <= 800) return 0
	if (diameterKm <= 2_000) return 1
	return clamp(Math.round((diameterKm - 400) / 1_600), 0, 15)
}

export function estimateGasGiantSizeClass(diameterKm: number): number {
	const earthDiameters = diameterKm / EARTH_DIAMETER_KM
	if (earthDiameters < 6) return 16
	if (earthDiameters < 12) return 17
	return 18
}

export function estimatePlanetarySizeClass(
	diameterKm: number,
	isGasGiant: boolean,
): number {
	return isGasGiant
		? estimateGasGiantSizeClass(diameterKm)
		: estimateRockySizeClass(diameterKm)
}
