import type { LocalSlopeParams } from "@/model/geography/terrain/slope/types"

function local({
	mesh,
	elevationKm,
	planetRadiusKm,
}: LocalSlopeParams): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList, neighborDist } = mesh
	const localSlope = new Float32Array(N)
	const localWeight = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			const edgeKm = Math.max(1e-6, (neighborDist[j] ?? 0) * planetRadiusKm)
			const reliefKm = Math.abs(elevationKm[r] - elevationKm[nb])
			const slope = reliefKm / edgeKm
			const weight = 1 / edgeKm
			localSlope[r] += slope * weight
			localWeight[r] += weight
		}
	}

	for (let r = 0; r < N; r++) {
		localSlope[r] = localWeight[r] > 0 ? localSlope[r] / localWeight[r] : 0
	}
	return localSlope
}

export const TERRAIN_SLOPE = { local }
