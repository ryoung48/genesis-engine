const EARTH_DIAMETER_KM = 12_742
const MIN_BODY_VISUAL_RATIO = 0.15
const MAX_BODY_VISUAL_RATIO = 3.6
export const BODY_VISUAL_BASE_RADIUS = 0.12

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

export function scaleBodyDiameterToVisualRadius(
	diameterKm: number,
	baseVisualRadius: number,
): number {
	if (!(diameterKm > 0) || !(baseVisualRadius > 0)) return 0
	const ratio = clamp(
		Math.sqrt(diameterKm / EARTH_DIAMETER_KM),
		MIN_BODY_VISUAL_RATIO,
		MAX_BODY_VISUAL_RATIO,
	)
	return baseVisualRadius * ratio
}

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

interface OrbitDisplayLayoutEntry {
	orbitalDistancePlanetRadii: number
	eccentricity: number
	bodyVisualRadius: number
}

interface LayoutMoonOrbitPeriapsesForDisplayParams {
	orbits: OrbitDisplayLayoutEntry[]
	parentVisualRadius: number
	minDisplayDistance: number
	maxDisplayDistance: number
}

function buildMoonOrbitDisplayLayout(
	params: LayoutMoonOrbitPeriapsesForDisplayParams,
): {
	periapses: number[]
	outerRadius: number
} {
	const { orbits, parentVisualRadius, minDisplayDistance, maxDisplayDistance } =
		params
	if (orbits.length === 0) {
		return { periapses: [], outerRadius: parentVisualRadius }
	}

	const maxOrbitalDistancePlanetRadii = Math.max(
		...orbits.map(
			(orbit) => orbit.orbitalDistancePlanetRadii * (1 + orbit.eccentricity),
		),
	)
	const defaultGap = Math.max(
		0.15,
		(maxDisplayDistance - minDisplayDistance) * 0.004,
	)

	const positioned = orbits
		.map((orbit, index) => {
			const realPeriapsisPlanetRadii =
				orbit.orbitalDistancePlanetRadii * (1 - orbit.eccentricity)
			const nominalPeriapsis = scaleMoonOrbitDistanceForDisplay({
				orbitalDistancePlanetRadii: realPeriapsisPlanetRadii,
				maxOrbitalDistancePlanetRadii,
				minDisplayDistance,
				maxDisplayDistance,
			})
			return {
				index,
				...orbit,
				nominalPeriapsis,
				realPeriapsisPlanetRadii,
			}
		})
		.sort(
			(a, b) =>
				a.realPeriapsisPlanetRadii - b.realPeriapsisPlanetRadii ||
				a.nominalPeriapsis - b.nominalPeriapsis,
	)

	const periapses = new Array<number>(orbits.length)
	let previousOuterEdge = parentVisualRadius
	let previousBodyVisualRadius = parentVisualRadius
	for (const orbit of positioned) {
		const entryGap = Math.max(
			defaultGap,
			(previousBodyVisualRadius + orbit.bodyVisualRadius) * 0.18,
		)
		const minimumPeriapsis =
			previousOuterEdge + entryGap + orbit.bodyVisualRadius
		const periapsis = Math.max(orbit.nominalPeriapsis, minimumPeriapsis)
		periapses[orbit.index] = periapsis

		const apoapsisScale =
			orbit.eccentricity < 1
				? (1 + orbit.eccentricity) / Math.max(1 - orbit.eccentricity, 1e-6)
				: 1
		const orbitOuterEdge =
			periapsis * apoapsisScale + orbit.bodyVisualRadius + entryGap * 0.35
		previousOuterEdge = Math.max(previousOuterEdge, orbitOuterEdge)
		previousBodyVisualRadius = orbit.bodyVisualRadius
	}

	return {
		periapses,
		outerRadius: previousOuterEdge,
	}
}

export function layoutMoonOrbitPeriapsesForDisplay(
	params: LayoutMoonOrbitPeriapsesForDisplayParams,
): number[] {
	return buildMoonOrbitDisplayLayout(params).periapses
}

export function measureMoonOrbitOuterRadiusForDisplay(
	params: LayoutMoonOrbitPeriapsesForDisplayParams,
): number {
	return buildMoonOrbitDisplayLayout(params).outerRadius
}
