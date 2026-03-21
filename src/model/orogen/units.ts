import type { SphereMesh } from "./types"

export const DEFAULT_PLANET_RADIUS_KM = 6371

type MeshWithOptionalNeighborDist = Pick<SphereMesh, "numRegions"> & {
	neighborDist?: Float32Array
}

export function getPlanetRadiusKm(planetRadiusKm?: number): number {
	return planetRadiusKm && planetRadiusKm > 0 ? planetRadiusKm : DEFAULT_PLANET_RADIUS_KM
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
