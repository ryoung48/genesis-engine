import type {
	CellDistanceParams,
	ComponentsParams,
	DijkstraParams,
	DijkstraResult,
	SimMesh,
	SimSpace,
} from "@/model/geography/tectonics/sim-mesh/types"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"
import { SPREAD } from "@/model/shared/spread"

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
	const km = new Float64Array(n).fill(Infinity)
	const carried = new Float32Array(n)
	for (let c = 0; c < n; c++)
		if (isSource(c)) {
			km[c] = 0
			carried[c] = carry(c)
		}
	SPREAD.km({
		mesh: s.mesh,
		radiusKm: s.radiusKm,
		dist: km,
		maxKm,
		canEnter: ({ to }) => canEnter(to),
		onReach: ({ from, to }) => {
			carried[to] = carried[from]
		},
	})
	return { km, carried }
}

function components({ space: { mesh }, isMember }: ComponentsParams) {
	return SPREAD.components({ mesh, isMember, canConnect: () => true })
}

export const SIM_MESH = { get, space, distanceKm, dijkstra, components }
