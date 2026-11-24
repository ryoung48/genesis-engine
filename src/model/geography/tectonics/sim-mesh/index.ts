import type {
	CellDistanceParams,
	Components,
	ComponentsParams,
	DijkstraParams,
	DijkstraResult,
	SimMesh,
	SimSpace,
} from "@/model/geography/tectonics/sim-mesh/types"
import { MESH } from "@/model/mesh"
import { PriorityHeap } from "@/model/shared/min-heap"
import { RNG } from "@/model/shared/random/rng"

const SIM_CELLS = 40000
const SIM_JITTER = 0.35
const SIM_SEED = 12345 + 4242

let cached: SimMesh | null = null

function get(): SimMesh {
	if (cached) return cached
	const mesh = MESH.buildSphereMesh({
		n: SIM_CELLS,
		jitter: SIM_JITTER,
		rng: RNG.createRng({ seed: SIM_SEED }),
	})
	const index = MESH.buildRegionSpatialIndex(mesh)
	cached = {
		mesh,
		edgeRad: Math.sqrt((8 * Math.PI) / (Math.sqrt(3) * mesh.numRegions)),
		nearest: ({ x, y, z }) =>
			index.nearest(
				(Math.atan2(y, x) * 180) / Math.PI,
				(Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI,
			),
	}
	return cached
}

function space(radiusKm: number): SimSpace {
	const simMesh = get()
	return {
		mesh: simMesh.mesh,
		radiusKm,
		edgeKm: simMesh.edgeRad * radiusKm,
		nearest: simMesh.nearest,
	}
}

function distanceKm({ space: s, a, b }: CellDistanceParams): number {
	const { r_xyz } = s.mesh
	const d =
		r_xyz[3 * a] * r_xyz[3 * b] +
		r_xyz[3 * a + 1] * r_xyz[3 * b + 1] +
		r_xyz[3 * a + 2] * r_xyz[3 * b + 2]
	return Math.acos(Math.max(-1, Math.min(1, d))) * s.radiusKm
}

function dijkstra({
	space: s,
	isSource,
	canEnter,
	maxKm,
	carry,
}: DijkstraParams): DijkstraResult {
	const n = s.mesh.numRegions
	const { adjOffset, adjList } = s.mesh
	const km = new Float64Array(n).fill(Infinity)
	const carried = new Float32Array(n)
	const heap = new PriorityHeap<number>()
	for (let c = 0; c < n; c++)
		if (isSource(c)) {
			km[c] = 0
			carried[c] = carry(c)
			heap.push(0, c)
		}
	for (let top = heap.pop(); top; top = heap.pop()) {
		const c = top.value
		if (top.key > km[c]) continue
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (!canEnter(nb)) continue
			const nd = top.key + distanceKm({ space: s, a: c, b: nb })
			if (nd < km[nb] && nd <= maxKm) {
				km[nb] = nd
				carried[nb] = carried[c]
				heap.push(nd, nb)
			}
		}
	}
	return { km, carried }
}

function components({ space: s, isMember }: ComponentsParams): Components {
	const n = s.mesh.numRegions
	const { adjOffset, adjList } = s.mesh
	const label = new Int32Array(n).fill(-1)
	const cells: number[][] = []
	for (let start = 0; start < n; start++) {
		if (!isMember(start) || label[start] >= 0) continue
		const q = [start]
		label[start] = cells.length
		for (let h = 0; h < q.length; h++)
			for (let k = adjOffset[q[h]]; k < adjOffset[q[h] + 1]; k++) {
				const nb = adjList[k]
				if (isMember(nb) && label[nb] < 0) {
					label[nb] = cells.length
					q.push(nb)
				}
			}
		cells.push(q)
	}
	return { label, cells }
}

export const SIM_MESH = { get, space, distanceKm, dijkstra, components }
