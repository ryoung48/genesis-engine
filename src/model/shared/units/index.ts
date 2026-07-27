import type {
	MeanEdgeLengthKmParams,
	RegionDistanceKmParams,
	RegionPathLengthKmParams,
} from "@/model/shared/units/types"

const defaultPlanetRadiusKm = 6371

const defaultObliquityDeg = 23.5

const defaultEccentricity = 0.0167

const defaultDaysPerYear = 365

const defaultHoursPerDay = 24

const defaultSubstellarLon = 0

const defaultPerihelion = 102

function getEffectiveObliquityDeg(obliquity: number): number {
	return obliquity > 90 ? 180 - obliquity : obliquity
}

function isRetrogradeObliquity(obliquity: number): boolean {
	return obliquity > 90
}

function getMaxOceanDepthKm(_planetRadiusKm: number): number {
	return 10
}

function meanEdgeLengthKm({
	mesh,
	planetRadiusKm = defaultPlanetRadiusKm,
}: MeanEdgeLengthKmParams): number {
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

function regionPathLengthKm({
	r_xyz,
	pathRegions,
	planetRadiusKm = defaultPlanetRadiusKm,
}: RegionPathLengthKmParams): number {
	let totalKm = 0
	for (let i = 1; i < pathRegions.length; i++) {
		totalKm += regionDistanceKm({
			r_xyz,
			fromRegion: pathRegions[i - 1],
			toRegion: pathRegions[i],
			planetRadiusKm,
		})
	}
	return totalKm
}

function regionDistanceKm({
	r_xyz,
	fromRegion,
	toRegion,
	planetRadiusKm = defaultPlanetRadiusKm,
}: RegionDistanceKmParams): number {
	if (fromRegion < 0 || toRegion < 0 || fromRegion === toRegion) return 0
	const fromOffset = fromRegion * 3
	const toOffset = toRegion * 3
	const cosTheta =
		r_xyz[fromOffset] * r_xyz[toOffset] +
		r_xyz[fromOffset + 1] * r_xyz[toOffset + 1] +
		r_xyz[fromOffset + 2] * r_xyz[toOffset + 2]
	return Math.acos(Math.max(-1, Math.min(1, cosTheta))) * planetRadiusKm
}

export const UNITS = {
	defaultPlanetRadiusKm,
	defaultObliquityDeg,
	defaultEccentricity,
	defaultDaysPerYear,
	defaultHoursPerDay,
	defaultSubstellarLon,
	defaultPerihelion,
	getEffectiveObliquityDeg,
	isRetrogradeObliquity,
	getMaxOceanDepthKm,
	meanEdgeLengthKm,
	regionPathLengthKm,
	regionDistanceKm,
}
