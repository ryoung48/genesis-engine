import type { SphereMesh } from "./types"

export const DEFAULT_PLANET_RADIUS_KM = 6371
export const DEFAULT_OBLIQUITY_DEG = 23.5
export const DEFAULT_ECCENTRICITY = 0.0167
export const DEFAULT_SUN_TEMP_FACTOR = 1
export const DEFAULT_DAYS_PER_YEAR = 365
export const DEFAULT_HOURS_PER_DAY = 24

type MeshWithOptionalNeighborDist = Pick<SphereMesh, "numRegions"> & {
	neighborDist?: Float32Array
}

export function getPlanetRadiusKm(planetRadiusKm?: number): number {
	return planetRadiusKm && planetRadiusKm > 0 ? planetRadiusKm : DEFAULT_PLANET_RADIUS_KM
}

export function getObliquityDeg(obliquity?: number): number {
	if (typeof obliquity !== "number" || !Number.isFinite(obliquity)) return DEFAULT_OBLIQUITY_DEG
	const normalized = ((obliquity % 360) + 360) % 360
	return normalized > 180 ? 360 - normalized : normalized
}

export function getEffectiveObliquityDeg(obliquity?: number): number {
	const tilt = getObliquityDeg(obliquity)
	return tilt > 90 ? 180 - tilt : tilt
}

export function isRetrogradeObliquity(obliquity?: number): boolean {
	return getObliquityDeg(obliquity) > 90
}

export function getEccentricity(eccentricity?: number): number {
	if (typeof eccentricity !== "number" || !Number.isFinite(eccentricity)) return DEFAULT_ECCENTRICITY
	return Math.max(0, Math.min(0.99, eccentricity))
}

export function getSunTempFactor(sunTempFactor?: number): number {
	if (typeof sunTempFactor !== "number" || !Number.isFinite(sunTempFactor)) return DEFAULT_SUN_TEMP_FACTOR
	return Math.max(0.1, Math.min(10, sunTempFactor))
}

export function getDaysPerYear(daysPerYear?: number): number {
	if (typeof daysPerYear !== "number" || !Number.isFinite(daysPerYear)) return DEFAULT_DAYS_PER_YEAR
	return Math.max(30, Math.min(5000, daysPerYear))
}

export function getHoursPerDay(hoursPerDay?: number): number {
	if (typeof hoursPerDay !== "number" || !Number.isFinite(hoursPerDay)) return DEFAULT_HOURS_PER_DAY
	return Math.max(1, Math.min(240, hoursPerDay))
}

export function isTidallyLocked(tidallyLocked?: boolean): boolean {
	return tidallyLocked === true
}

export function meanEdgeLengthKm(mesh: MeshWithOptionalNeighborDist, planetRadiusKm?: number): number {
	const radiusKm = getPlanetRadiusKm(planetRadiusKm)
	if (!mesh.neighborDist?.length) {
		const sphereAreaKm2 = 4 * Math.PI * radiusKm * radiusKm
		const meanCellAreaKm2 = sphereAreaKm2 / Math.max(1, mesh.numRegions)
		return Math.sqrt((2 * meanCellAreaKm2) / (3 * Math.sqrt(3)))
	}
	let edgeSum = 0
	for (let i = 0; i < mesh.neighborDist.length; i++) edgeSum += mesh.neighborDist[i]
	return (edgeSum / Math.max(1, mesh.neighborDist.length)) * radiusKm
}
