import {
	EARTH_DIAMETER_KM,
	SOLAR_DIAMETER_KM,
} from "@/model/celestial/orbit-body"

// Shared floor/ceiling for every rendered body's diameter — planets, moons,
// and (via this same function) the star — when "realistic sizes" is on. A
// floor keeps tiny bodies (small moons, asteroid-belt-adjacent dwarfs) from
// shrinking to an unclickable/invisible speck; a ceiling keeps the largest
// real stars (which can run to several hundred times Earth's diameter) from
// swallowing the scene. Between the two, every body renders at its true
// relative diameter.
const MIN_BODY_DIAMETER_KM = 400
const MAX_BODY_DIAMETER_KM = 5 * SOLAR_DIAMETER_KM
export const BODY_VISUAL_BASE_RADIUS = 0.12

// The pre-"realistic sizes" behavior, taking its shape from galaxy-gen's
// orbit-spacing curve (ORBIT.spawn's
// `r = scaleLinear([-1, 0, 5, 10, 14, 15], [0, 1, 3, 6, 8, 10])(size)`):
// a chunky, piecewise-linear step function keyed off the body's discrete
// size class (0–15 rocky/moon, 16–18 gas giant — see size-class.ts /
// estimateMoonSizeClassFromDiameter) rather than a continuous function of
// true diameter. Bodies read in broad "size tiers" instead of smoothly
// reflecting their real relative scale — e.g. every size-15 rocky world
// renders the same regardless of whether it's just barely or hugely bigger
// than a size-14 one.
const SIZE_CLASS_RATIO_BREAKPOINTS: readonly [
	sizeClass: number,
	ratio: number,
][] = [
	[0, 0.2],
	[1, 0.3],
	[5, 0.6],
	[10, 1.1],
	[15, 1.8],
	[16, 2.3],
	[17, 2.9],
	[18, 3.6],
]

function sizeClassToVisualRatio(sizeClass: number): number {
	const points = SIZE_CLASS_RATIO_BREAKPOINTS
	if (sizeClass <= points[0][0]) return points[0][1]
	for (let i = 1; i < points.length; i++) {
		const [x1, y1] = points[i]!
		if (sizeClass <= x1) {
			const [x0, y0] = points[i - 1]!
			const t = x1 === x0 ? 0 : (sizeClass - x0) / (x1 - x0)
			return y0 + t * (y1 - y0)
		}
	}
	return points[points.length - 1]![1]
}

export function scaleBodyDiameterToVisualRadius(
	diameterKm: number,
	baseVisualRadius: number,
	realisticSizes: boolean,
	sizeClass: number,
): number {
	if (!(diameterKm > 0) || !(baseVisualRadius > 0)) return 0
	if (!realisticSizes) {
		return baseVisualRadius * sizeClassToVisualRatio(sizeClass)
	}
	const clampedDiameterKm = Math.min(
		Math.max(diameterKm, MIN_BODY_DIAMETER_KM),
		MAX_BODY_DIAMETER_KM,
	)
	const ratio = clampedDiameterKm / EARTH_DIAMETER_KM
	return baseVisualRadius * ratio
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

function scaleMoonOrbitDistanceForDisplay(params: {
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
