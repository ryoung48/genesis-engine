import { STATS } from "@/model/shared/stats"
import type {
	BuildDummyBoundaryParams,
	BuildSyntheticPlatesParams,
	ComputeSimpleDistanceFieldsParams,
	DeriveSyntheticPlatesParams,
} from "@/model/tectonics/synthetic-plates/types"
import type {
	BoundaryInfo,
	DistanceFields,
	TectonicPlate,
} from "@/model/tectonics/types"

function deriveSyntheticPlates({
	mesh,
	elevation,
}: DeriveSyntheticPlatesParams): {
	plateAssignment: Int32Array
	plateIds: number[]
	plateIsOcean: Set<number>
} {
	const N = mesh.numRegions
	const r_plate = new Int32Array(N).fill(-1)
	const plateIds: number[] = []
	const plateIsOcean = new Set<number>()
	const { adjOffset, adjList } = mesh

	for (let r = 0; r < N; r++) {
		if (r_plate[r] >= 0) continue
		const isOcean = elevation[r] <= 0
		r_plate[r] = r
		plateIds.push(r)
		if (isOcean) plateIsOcean.add(r)

		const queue = [r]
		let head = 0
		while (head < queue.length) {
			const cur = queue[head++]
			for (let ni = adjOffset[cur], end = adjOffset[cur + 1]; ni < end; ni++) {
				const nb = adjList[ni]
				if (r_plate[nb] >= 0) continue
				if (elevation[nb] <= 0 === isOcean) {
					r_plate[nb] = r
					queue.push(nb)
				}
			}
		}
	}

	return { plateAssignment: r_plate, plateIds, plateIsOcean }
}

function buildSyntheticPlates({
	plateIds,
	plateIsOcean,
}: BuildSyntheticPlatesParams): TectonicPlate[] {
	return plateIds.map((pid, idx) => ({
		id: idx,
		isOcean: plateIsOcean.has(pid),
		pole: [0, 0, 1] as [number, number, number],
		omega: 0,
		regions: new Set<number>(),
		growthRate: 1,
		growthDir: [0, 0, 0] as [number, number, number],
		dirStrength: 0,
	}))
}

function buildDummyBoundary({
	mesh,
	elevation,
}: BuildDummyBoundaryParams): BoundaryInfo {
	const mountain_r = new Set<number>()
	const coastline_r = new Set<number>()
	const ocean_r = new Set<number>()
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] <= 0) {
			ocean_r.add(r)
		} else if (elevation[r] > 0.5) {
			mountain_r.add(r)
		}
		if (elevation[r] > 0) {
			for (
				let j = mesh.adjOffset[r], jEnd = mesh.adjOffset[r + 1];
				j < jEnd;
				j++
			) {
				if (elevation[mesh.adjList[j]] <= 0) {
					coastline_r.add(r)
					break
				}
			}
		}
	}

	return {
		mountain_r,
		coastline_r,
		ocean_r,
		r_stress: new Float32Array(mesh.numRegions),
		r_subductFactor: new Float32Array(mesh.numRegions),
		r_boundaryType: new Int8Array(mesh.numRegions),
		r_bothOcean: new Uint8Array(mesh.numRegions),
		r_hasOcean: new Uint8Array(mesh.numRegions),
	}
}

function computeSimpleDistanceFields({
	mesh,
	elevation,
	planetRadiusKm,
}: ComputeSimpleDistanceFieldsParams): DistanceFields {
	const N = mesh.numRegions
	const isLand = new Uint8Array(N)
	for (let r = 0; r < N; r++) isLand[r] = elevation[r] > 0 ? 1 : 0
	const { distCoast, distCoastLand } = STATS.computeCoastDistances({
		mesh,
		isLand,
		planetRadiusKm,
	})
	return {
		distMountain: new Float32Array(N),
		distOcean: new Float32Array(N),
		distCoastline: new Float32Array(N),
		distCoast,
		distCoastLand,
	}
}

export const SYNTHETIC_PLATES = {
	deriveSyntheticPlates,
	buildSyntheticPlates,
	buildDummyBoundary,
	computeSimpleDistanceFields,
}
