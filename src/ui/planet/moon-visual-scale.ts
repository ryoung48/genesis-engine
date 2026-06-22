export function getMoonRadiusRelativeToPlanet(
	moonDiameterKm: number,
	planetRadiusKm: number,
): number {
	if (!(moonDiameterKm > 0) || !(planetRadiusKm > 0)) return 0
	return moonDiameterKm / (planetRadiusKm * 2)
}

export function scaleMoonRadiusToPlanetVisualRadius(
	moonDiameterKm: number,
	planetRadiusKm: number,
	planetVisualRadius: number,
): number {
	return (
		planetVisualRadius *
		getMoonRadiusRelativeToPlanet(moonDiameterKm, planetRadiusKm)
	)
}

const MIN_REAL_ORBIT_PLANET_RADII = 2
const REFERENCE_MAX_REAL_ORBIT_PLANET_RADII = 60
const ORBIT_DISTANCE_COMPRESSION_POWER = 0.6

export function getMoonOrbitDistanceRelativeToPlanet(
	semiMajorAxisM: number,
	planetRadiusKm: number,
): number {
	if (!(semiMajorAxisM > 0) || !(planetRadiusKm > 0)) return 0
	return semiMajorAxisM / (planetRadiusKm * 1000)
}

export function scaleMoonOrbitDistanceForDisplay(params: {
	orbitalDistancePlanetRadii: number
	maxOrbitalDistancePlanetRadii: number
	minDisplayDistance: number
	maxDisplayDistance: number
}): number {
	const {
		orbitalDistancePlanetRadii,
		maxOrbitalDistancePlanetRadii,
		minDisplayDistance,
		maxDisplayDistance,
	} = params
	const effectiveMax = Math.max(
		REFERENCE_MAX_REAL_ORBIT_PLANET_RADII,
		maxOrbitalDistancePlanetRadii,
		MIN_REAL_ORBIT_PLANET_RADII + 1,
	)
	const normalized =
		(orbitalDistancePlanetRadii - MIN_REAL_ORBIT_PLANET_RADII) /
		(effectiveMax - MIN_REAL_ORBIT_PLANET_RADII)
	const clamped = Math.max(0, Math.min(1, normalized))
	const compressed = Math.pow(clamped, ORBIT_DISTANCE_COMPRESSION_POWER)
	return (
		minDisplayDistance + compressed * (maxDisplayDistance - minDisplayDistance)
	)
}
