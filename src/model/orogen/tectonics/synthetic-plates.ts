/**
 * Shared helpers for deriving synthetic plate data from elevation.
 * Used by both the heightmap import pipeline and the stagnant lid pipeline
 * to construct the dummy BoundaryInfo / DistanceFields that downstream
 * climate + river systems require.
 */
import type {
	BoundaryInfo,
	DistanceFields,
	SphereMesh,
	TectonicPlate,
} from "../types"

export function deriveSyntheticPlates(
	mesh: SphereMesh,
	elevation: Float32Array,
): {
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

export function buildSyntheticPlates(
	plateIds: number[],
	plateIsOcean: Set<number>,
): TectonicPlate[] {
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

export function buildDummyBoundary(
	mesh: SphereMesh,
	elevation: Float32Array,
): BoundaryInfo {
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

export function computeSimpleDistanceFields(
	mesh: SphereMesh,
	elevation: Float32Array,
): DistanceFields {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const distCoastLand = new Float32Array(N).fill(Infinity)
	const distCoast = new Float32Array(N).fill(Infinity)

	const coastQueue: number[] = []
	const landQueue: number[] = []
	for (let r = 0; r < N; r++) {
		const isOcean = elevation[r] <= 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if (elevation[adjList[j]] <= 0 !== isOcean) {
				distCoast[r] = 0
				coastQueue.push(r)
				if (!isOcean) {
					distCoastLand[r] = 0
					landQueue.push(r)
				}
				break
			}
		}
	}

	let head = 0
	while (head < coastQueue.length) {
		const r = coastQueue[head++]
		const d = distCoast[r] + 1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (d < distCoast[nb]) {
				distCoast[nb] = d
				coastQueue.push(nb)
			}
		}
	}

	head = 0
	while (head < landQueue.length) {
		const r = landQueue[head++]
		const d = distCoastLand[r] + 1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (d < distCoastLand[nb] && elevation[nb] > 0) {
				distCoastLand[nb] = d
				landQueue.push(nb)
			}
		}
	}

	return {
		distMountain: new Float32Array(N),
		distOcean: new Float32Array(N),
		distCoastline: new Float32Array(N),
		distCoast,
		distCoastLand,
	}
}
