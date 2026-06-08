import type { OrogenRivers, SphereMesh } from ".."
import { BIOME_LABELS } from "../climate/vegetation"
import { SimplexNoise } from "../shared/simplex-noise"
import type { OrogenLandmarks } from "../terrain/landmarks"
import { LANDMARK_TYPE_LAKE } from "../terrain/landmarks"

export const TOPO_FLAT = 0
export const TOPO_HILL = 1
export const TOPO_PLATEAU = 2
export const TOPO_MOUNTAIN = 3
export const TOPO_MARSH = 4
export const TOPO_OCEAN = 5
export const TOPO_LAKE = 6

function computeSlopeScore(
	mesh: SphereMesh,
	elevationKm: Float32Array,
	planetRadiusKm = 6371,
): Float32Array {
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

	const smoothedSlope = new Float32Array(N)
	const smoothWeight = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		smoothedSlope[r] = localSlope[r] * 2
		smoothWeight[r] = 2
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			smoothedSlope[r] += localSlope[adjList[j]]
			smoothWeight[r] += 1
		}
		smoothedSlope[r] = (smoothedSlope[r] / smoothWeight[r]) * 100
	}

	const sorted = smoothedSlope.slice().sort()
	const p95 =
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
	const scaleRef = Math.max(1e-3, p95)
	for (let r = 0; r < N; r++) {
		smoothedSlope[r] = Math.max(0, Math.min(1, smoothedSlope[r] / scaleRef))
	}

	return smoothedSlope
}

export function classifyTopography(params: {
	mesh: SphereMesh
	elevationKm: Float32Array
	isLand: Uint8Array
	rivers: Pick<OrogenRivers, "visible" | "terminal">
	landmarks: Pick<OrogenLandmarks, "regionLandmark" | "type">
	vegetation?: Uint8Array
	slopeScore?: Float32Array
	planetRadiusKm?: number
	seed?: number
	/** Pre-computed tidal range [0,1] per cell — boosts coastal marsh formation */
	tidalRange?: Float32Array
}): {
	topography: Uint8Array
	coastal: Uint8Array
	oceanCoastal: Uint8Array
	lakeCoastal: Uint8Array
	slopeScore: Float32Array
} {
	const {
		mesh,
		elevationKm,
		isLand,
		rivers,
		vegetation,
		planetRadiusKm,
		tidalRange,
	} = params
	const slopeScore =
		params.slopeScore ?? computeSlopeScore(mesh, elevationKm, planetRadiusKm)
	const topography = new Uint8Array(mesh.numRegions)
	const coastal = new Uint8Array(mesh.numRegions)
	const { adjOffset, adjList, r_xyz } = mesh
	const { regionLandmark, type: landmarkType } = params.landmarks
	function isLake(r: number): boolean {
		if (isLand[r]) return false
		const lid = regionLandmark[r]
		return lid >= 0 && landmarkType[lid] === LANDMARK_TYPE_LAKE
	}
	const adjacentLake = new Uint8Array(mesh.numRegions)
	const adjacentOcean = new Uint8Array(mesh.numRegions)
	const adjacentTerminal = new Uint8Array(mesh.numRegions)
	const adjacentRiver = new Uint8Array(mesh.numRegions)
	const marsh = new Uint8Array(mesh.numRegions)
	const marshNoise = new Float32Array(mesh.numRegions)
	const noise1 = new SimplexNoise((params.seed ?? 0) + 7101)
	const noise2 = new SimplexNoise((params.seed ?? 0) + 7102)
	const noise3 = new SimplexNoise((params.seed ?? 0) + 7103)
	const desertBiome = BIOME_LABELS.indexOf("desert")
	const marshNoiseThreshold = 0.48
	const marshScoreThreshold = 0.64

	function isMarshCandidate(r: number): boolean {
		const isDesert = vegetation?.[r] === desertBiome
		return isLand[r] === 1 && (!isDesert || rivers.terminal[r])
	}

	function marshEdgeBias(r: number): number {
		return marshNoise[r]
	}

	for (let r = 0; r < mesh.numRegions; r++) {
		if (isLake(r)) {
			topography[r] = TOPO_LAKE
			continue
		}
		if (!isLand[r]) {
			topography[r] = TOPO_OCEAN
			continue
		}

		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]
		const broad = noise1.noise3D(x * 5.5, y * 5.5, z * 5.5)
		const medium = noise2.noise3D(x * 12.5 + 17, y * 12.5 + 17, z * 12.5 + 17)
		const breakup = noise3.noise3D(x * 24 + 31, y * 24 + 31, z * 24 + 31)
		const n = broad * 0.55 + medium * 0.2 + breakup * 0.25
		marshNoise[r] = 0.5 + 0.5 * n

		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLake(nb)) adjacentLake[r] = 1
			if (!isLand[nb] && !isLake(nb)) adjacentOcean[r] = 1
			if (rivers.visible[nb] || rivers.terminal[nb]) adjacentRiver[r] = 1
			if (rivers.terminal[nb]) adjacentTerminal[r] = 1
		}
	}

	for (let r = 0; r < mesh.numRegions; r++) {
		if (!isMarshCandidate(r)) continue
		if (rivers.visible[r] || rivers.terminal[r]) adjacentRiver[r] = 1
		if (rivers.terminal[r]) {
			marsh[r] = 1
			continue
		}

		const noiseBias = marshEdgeBias(r)
		const elevation = elevationKm[r]
		const slope = slopeScore[r]
		if (elevation > 0.27 || slope > 0.16) continue

		const elevationFactor = Math.max(0, Math.min(1, 1 - elevation / 0.22))
		const slopeFactor = Math.max(0, Math.min(1, 1 - slope / 0.11))
		const lakeBonus = adjacentLake[r] ? 0.14 : 0
		const riverBonus = adjacentRiver[r] ? 0.08 : 0
		const terminalBonus = adjacentTerminal[r] ? 0.14 : 0
		const coastalBonus = adjacentOcean[r] ? 0.1 : 0
		const tidalBonus = (tidalRange?.[r] ?? 0) * 0.2
		const marshScore =
			noiseBias * 0.58 +
			elevationFactor * 0.17 +
			slopeFactor * 0.13 +
			lakeBonus +
			riverBonus +
			terminalBonus +
			coastalBonus +
			tidalBonus
		if (noiseBias >= marshNoiseThreshold && marshScore >= marshScoreThreshold)
			marsh[r] = 1
	}

	for (let r = 0; r < mesh.numRegions; r++) {
		if (!isLand[r]) continue

		const elevation = elevationKm[r]
		const slope = slopeScore[r]
		if (adjacentOcean[r] || adjacentLake[r]) coastal[r] = 1

		if (marsh[r]) {
			topography[r] = TOPO_MARSH
			continue
		}
		if (
			(elevation >= 2.2 && slope >= 0.3) ||
			(elevation >= 1.2 && slope >= 0.45) ||
			(elevation > 0.5 && slope > 0.6)
		) {
			topography[r] = TOPO_MOUNTAIN
			continue
		}
		if (
			(elevation >= 1.0 && slope < 0.3) ||
			(elevation >= 0.8 && slope < 0.2)
		) {
			topography[r] = TOPO_PLATEAU
			continue
		}
		if (elevation > 0.1 && slope >= 0.2) {
			topography[r] = TOPO_HILL
			continue
		}
		topography[r] = TOPO_FLAT
	}

	return {
		topography,
		coastal,
		oceanCoastal: adjacentOcean,
		lakeCoastal: adjacentLake,
		slopeScore,
	}
}
