import type {
	ApplyMarshParams,
	ClassifyTopographyParams,
	ComputeSlopeScoreParams,
	IsSaltFlatParams,
} from "@/model/geography/terrain/classification/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { LAKES } from "@/model/geography/terrain/lakes"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { TERRAIN_SLOPE } from "@/model/geography/terrain/slope"

const C = GROUNDWATER_CONFIG

const topoFlat = 0

const topoHill = 1

const topoPlateau = 2

const topoMountain = 3

const topoMarsh = 4

const topoOcean = 5

const topoLake = 6

function computeSlopeScore({
	mesh,
	elevationKm,
	planetRadiusKm = 6371,
}: ComputeSlopeScoreParams): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const localSlope = TERRAIN_SLOPE.local({ mesh, elevationKm, planetRadiusKm })

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

const genesisTopographyLabels = [
	"flat",
	"hill",
	"plateau",
	"mountains",
	"marsh",
	"ocean",
	"lake",
] as const

function classifyTopography(params: ClassifyTopographyParams): {
	topography: Uint8Array
	coastal: Uint8Array
	oceanCoastal: Uint8Array
	lakeCoastal: Uint8Array
	slopeScore: Float32Array
} {
	const { mesh, elevationKm, isLand, planetRadiusKm } = params
	const slopeScore =
		params.slopeScore ??
		computeSlopeScore({ mesh, elevationKm, planetRadiusKm })
	const topography = new Uint8Array(mesh.numRegions)
	const coastal = new Uint8Array(mesh.numRegions)
	const { adjOffset, adjList } = mesh
	const isLake = (r: number) =>
		!isLand[r] && LANDMARKS.isLake({ landmarks: params.landmarks, region: r })
	const adjacentLake = new Uint8Array(mesh.numRegions)
	const adjacentOcean = new Uint8Array(mesh.numRegions)

	for (let r = 0; r < mesh.numRegions; r++) {
		if (isLake(r)) {
			topography[r] = topoLake
			continue
		}
		if (!isLand[r]) {
			topography[r] = topoOcean
			continue
		}

		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLake(nb)) adjacentLake[r] = 1
			if (!isLand[nb] && !isLake(nb)) adjacentOcean[r] = 1
		}
	}

	for (let r = 0; r < mesh.numRegions; r++) {
		if (!isLand[r]) continue

		const elevation = elevationKm[r]
		const slope = slopeScore[r]
		if (adjacentOcean[r] || adjacentLake[r]) coastal[r] = 1

		if (
			(elevation >= 2.2 && slope >= 0.3) ||
			(elevation >= 1.2 && slope >= 0.45) ||
			(elevation > 0.5 && slope > 0.6)
		) {
			topography[r] = topoMountain
			continue
		}
		if (
			(elevation >= 1.0 && slope < 0.3) ||
			(elevation >= 0.8 && slope < 0.2)
		) {
			topography[r] = topoPlateau
			continue
		}
		if (elevation > 0.1 && slope >= 0.2) {
			topography[r] = topoHill
			continue
		}
		topography[r] = topoFlat
	}

	return {
		topography,
		coastal,
		oceanCoastal: adjacentOcean,
		lakeCoastal: adjacentLake,
		slopeScore,
	}
}

function applyMarsh({ topography, wetlandShare }: ApplyMarshParams): void {
	for (let r = 0; r < topography.length; r++)
		if (topography[r] === topoFlat && wetlandShare[r] >= C.marshShare)
			topography[r] = topoMarsh
}

function isSaltFlat({ code, lakeKind }: IsSaltFlatParams): boolean {
	return code === topoFlat && lakeKind === LAKES.kindCode.pan
}

export const CLASSIFICATION = {
	computeSlopeScore,
	topoFlat,
	topoHill,
	topoPlateau,
	topoMountain,
	topoMarsh,
	topoOcean,
	topoLake,
	genesisTopographyLabels,
	classifyTopography,
	applyMarsh,
	isSaltFlat,
}
