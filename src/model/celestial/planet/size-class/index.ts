import { EARTH_DIAMETER_KM, ORBIT_BODY } from "../../orbit-body"
import type { PlanetarySizeClassInput } from "./types"

export function estimateRockySizeClass(diameterKm: number): number {
	return ORBIT_BODY.estimateRockySizeClassFromDiameterKm(diameterKm)
}

export function estimateGasGiantSizeClass(diameterKm: number): number {
	const earthDiameters = diameterKm / EARTH_DIAMETER_KM
	if (earthDiameters < 6) return 16
	if (earthDiameters < 12) return 17
	return 18
}

export function estimatePlanetarySizeClass({
	diameterKm,
	isGasGiant,
}: PlanetarySizeClassInput): number {
	return isGasGiant
		? estimateGasGiantSizeClass(diameterKm)
		: estimateRockySizeClass(diameterKm)
}
