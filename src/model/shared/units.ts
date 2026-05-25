import type { SphereMesh } from ".."

export const DEFAULT_PLANET_RADIUS_KM = 6371
export const DEFAULT_OBLIQUITY_DEG = 23.5
export const DEFAULT_ECCENTRICITY = 0.0167
export const DEFAULT_SUN_TEMP_FACTOR = 1
export const DEFAULT_INSOLATION_FACTOR = 1
export const DEFAULT_DAYS_PER_YEAR = 365
export const DEFAULT_HOURS_PER_DAY = 24
export const DEFAULT_ANTISTELLAR_LON = 180
export const DEFAULT_PERIHELION = 102

export function getEarthYearFactor(daysPerYear: number): number {
	return daysPerYear / DEFAULT_DAYS_PER_YEAR
}

type MeshWithOptionalNeighborDist = Pick<SphereMesh, "numRegions"> & {
	neighborDist?: Float32Array
}

export function getEffectiveObliquityDeg(obliquity: number): number {
	return obliquity > 90 ? 180 - obliquity : obliquity
}

export function isRetrogradeObliquity(obliquity: number): boolean {
	return obliquity > 90
}

/** Unit vector pointing at the substellar point (antistellar + 180°, lat=0). */
export function getSubstellarDir(
	antistellarLon: number,
): [number, number, number] {
	const subRad = ((antistellarLon + 180) % 360) * (Math.PI / 180)
	return [Math.cos(subRad), Math.sin(subRad), 0]
}

/**
 * Max mountain height scales ~1/g, and g ∝ R for rocky bodies of similar density.
 * Earth (6371 km) → 6 km practical tectonic max.
 */
export function getMaxElevationKm(_planetRadiusKm: number): number {
	return 6
}

export function getMaxOceanDepthKm(_planetRadiusKm: number): number {
	return 10
}

export function meanEdgeLengthKm(
	mesh: MeshWithOptionalNeighborDist,
	planetRadiusKm: number = DEFAULT_PLANET_RADIUS_KM,
): number {
	if (!mesh.neighborDist?.length) {
		const sphereAreaKm2 = 4 * Math.PI * planetRadiusKm * planetRadiusKm
		const meanCellAreaKm2 = sphereAreaKm2 / Math.max(1, mesh.numRegions)
		return Math.sqrt((2 * meanCellAreaKm2) / (3 * Math.sqrt(3)))
	}
	let edgeSum = 0
	for (let i = 0; i < mesh.neighborDist.length; i++)
		edgeSum += mesh.neighborDist[i]
	return (edgeSum / Math.max(1, mesh.neighborDist.length)) * planetRadiusKm
}

export function regionPathLengthKm(
	r_xyz: Float32Array,
	pathRegions: ArrayLike<number>,
	planetRadiusKm: number = DEFAULT_PLANET_RADIUS_KM,
): number {
	let totalKm = 0
	for (let i = 1; i < pathRegions.length; i++) {
		totalKm += regionDistanceKm(
			r_xyz,
			pathRegions[i - 1],
			pathRegions[i],
			planetRadiusKm,
		)
	}
	return totalKm
}

export function regionDistanceKm(
	r_xyz: Float32Array,
	fromRegion: number,
	toRegion: number,
	planetRadiusKm: number = DEFAULT_PLANET_RADIUS_KM,
): number {
	if (fromRegion < 0 || toRegion < 0 || fromRegion === toRegion) return 0
	const fromOffset = fromRegion * 3
	const toOffset = toRegion * 3
	const cosTheta =
		r_xyz[fromOffset] * r_xyz[toOffset] +
		r_xyz[fromOffset + 1] * r_xyz[toOffset + 1] +
		r_xyz[fromOffset + 2] * r_xyz[toOffset + 2]
	return Math.acos(Math.max(-1, Math.min(1, cosTheta))) * planetRadiusKm
}
