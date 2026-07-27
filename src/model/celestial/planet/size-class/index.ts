import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { PlanetarySizeClassInput } from "@/model/celestial/planet/size-class/types"

function estimateRockySizeClass(diameterKm: number): number {
	return ORBIT_BODY.estimateRockySizeClassFromDiameterKm(diameterKm)
}

function estimateGasGiantSizeClass(diameterKm: number): number {
	const earthDiameters = diameterKm / ORBIT_BODY.earthDiameterKm
	if (earthDiameters < 6) return 16
	if (earthDiameters < 12) return 17
	return 18
}

function estimatePlanetarySizeClass({
	diameterKm,
	isGasGiant,
}: PlanetarySizeClassInput): number {
	return isGasGiant
		? estimateGasGiantSizeClass(diameterKm)
		: estimateRockySizeClass(diameterKm)
}

export const SIZE_CLASS = {
	estimateRocky: estimateRockySizeClass,
	estimateGasGiant: estimateGasGiantSizeClass,
	estimatePlanetary: estimatePlanetarySizeClass,
}
