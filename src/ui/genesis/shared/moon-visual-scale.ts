const MIN_REAL_ORBIT_PLANET_RADII = 2
const MAX_REAL_ORBIT_PLANET_RADII = 400

function scaleMoonOrbitDistanceForDisplay(params: {
	orbitalDistancePlanetRadii: number
	minDisplayDistance: number
	maxDisplayDistance: number
}): number {
	const { orbitalDistancePlanetRadii, minDisplayDistance, maxDisplayDistance } =
		params
	const normalized =
		Math.log(orbitalDistancePlanetRadii / MIN_REAL_ORBIT_PLANET_RADII) /
		Math.log(MAX_REAL_ORBIT_PLANET_RADII / MIN_REAL_ORBIT_PLANET_RADII)
	const clamped = Math.max(0, Math.min(1, normalized))
	return (
		minDisplayDistance + clamped * (maxDisplayDistance - minDisplayDistance)
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

export function layoutMoonOrbitPeriapsesForDisplay(
	params: LayoutMoonOrbitPeriapsesForDisplayParams,
): number[] {
	const { orbits, parentVisualRadius, minDisplayDistance, maxDisplayDistance } =
		params
	if (orbits.length === 0) {
		return []
	}

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

		const apoapsis =
			(periapsis * (1 + orbit.eccentricity)) /
			Math.max(1 - orbit.eccentricity, 1e-6)
		const orbitOuterEdge = apoapsis + orbit.bodyVisualRadius + entryGap * 0.35
		previousOuterEdge = Math.max(previousOuterEdge, orbitOuterEdge)
		previousBodyVisualRadius = orbit.bodyVisualRadius
	}

	return periapses
}
