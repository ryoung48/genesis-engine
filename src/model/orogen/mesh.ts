/**
 * Sphere mesh construction: Fibonacci spiral → stereographic projection →
 * Delaunator → pole closure → SphereMesh.
 * Faithful port of orogen's sphere-mesh.js.
 */
import Delaunator from "delaunator"
import type { SphereMesh } from "./types"
import type { OrogenRng } from "./rng"

/**
 * Fibonacci sphere with jitter — evenly-distributed points on a unit sphere.
 */
function generateFibonacciSphere(
	N: number,
	jitter: number,
	rng: OrogenRng,
): Float32Array {
	const r_xyz = new Float32Array(3 * N)
	const s = 3.6 / Math.sqrt(N)
	const dlong = Math.PI * (3 - Math.sqrt(5))
	const dz = 2.0 / N

	let lng = 0
	let z = 1 - dz / 2
	for (let k = 0; k < N; k++, z -= dz) {
		const r = Math.sqrt(1 - z * z)
		let latDeg = (Math.asin(z) * 180) / Math.PI
		let lonDeg = (lng * 180) / Math.PI

		if (jitter > 0) {
			const jLat = rng.random() - rng.random()
			const jLon = rng.random() - rng.random()
			const nextZ = Math.max(-1, z - ((dz * 2 * Math.PI * r) / s))
			latDeg +=
				jitter * jLat * (latDeg - (Math.asin(nextZ) * 180) / Math.PI)
			lonDeg += jitter * jLon * ((s / r) * (180 / Math.PI))
		}

		const latR = (latDeg * Math.PI) / 180
		const lonR = (lonDeg * Math.PI) / 180
		r_xyz[3 * k] = Math.cos(latR) * Math.cos(lonR)
		r_xyz[3 * k + 1] = Math.cos(latR) * Math.sin(lonR)
		r_xyz[3 * k + 2] = Math.sin(latR)

		lng += dlong
	}
	return r_xyz
}

/**
 * Stereographic projection from north pole (0,0,1) onto a plane.
 */
function stereographicProjection(r_xyz: Float32Array, N: number): Float64Array {
	const flat = new Float64Array(2 * N)
	for (let i = 0; i < N; i++) {
		const z = r_xyz[3 * i + 2]
		const denom = Math.max(1e-12, 1 - z)
		flat[2 * i] = r_xyz[3 * i] / denom
		flat[2 * i + 1] = r_xyz[3 * i + 1] / denom
	}
	return flat
}

/**
 * Close the mesh by connecting hull edges to a pole point.
 */
function addPoleToMesh(
	poleId: number,
	triangles: Uint32Array,
	halfedges: Int32Array,
): { triangles: Int32Array; halfedges: Int32Array } {
	const numSides = triangles.length
	const next = (s: number) => (s % 3 === 2 ? s - 2 : s + 1)

	let numUnpaired = 0,
		firstUnpaired = -1
	const pointToSide: number[] = []
	for (let s = 0; s < numSides; s++) {
		if (halfedges[s] === -1) {
			numUnpaired++
			pointToSide[triangles[s]] = s
			firstUnpaired = s
		}
	}

	const nt = new Int32Array(numSides + 3 * numUnpaired)
	const nh = new Int32Array(numSides + 3 * numUnpaired)
	for (let i = 0; i < numSides; i++) {
		nt[i] = triangles[i]
		nh[i] = halfedges[i]
	}

	let s = firstUnpaired
	for (let i = 0; i < numUnpaired; i++) {
		const ns = numSides + 3 * i
		nh[s] = ns
		nh[ns] = s
		nt[ns] = nt[next(s)]
		nt[ns + 1] = nt[s]
		nt[ns + 2] = poleId
		const k = numSides + ((3 * i + 4) % (3 * numUnpaired))
		nh[ns + 2] = k
		nh[k] = ns + 2
		s = pointToSide[nt[next(s)]]
	}

	return { triangles: nt, halfedges: nh }
}

/**
 * Build a sphere mesh from N Fibonacci-spiral points using
 * Delaunator + stereographic projection + pole closure.
 */
export function buildSphereMesh(
	n: number,
	jitter: number,
	rng: OrogenRng,
): SphereMesh {
	const baseXyz = generateFibonacciSphere(n, jitter, rng)
	const flat = stereographicProjection(baseXyz, n)
	const delaunay = new Delaunator(flat)

	// Add pole point (N+1 regions total)
	const N = n + 1
	const r_xyz = new Float32Array(3 * N)
	r_xyz.set(baseXyz)
	r_xyz[3 * n] = 0
	r_xyz[3 * n + 1] = 0
	r_xyz[3 * n + 2] = 1

	const closed = addPoleToMesh(n, delaunay.triangles, delaunay.halfedges)
	const tris = closed.triangles
	const hes = closed.halfedges

	const numSides = tris.length
	const numTriangles = (numSides / 3) | 0
	const numRegions = N

	// Build per-region first-side lookup
	const r_s = new Int32Array(numRegions).fill(-1)
	for (let s = 0; s < numSides; s++) {
		const r = tris[s]
		if (r_s[r] === -1) r_s[r] = s
	}

	const nextSide = (s: number) => (s % 3 === 2 ? s - 2 : s + 1)

	// Build CSR adjacency by circulating halfedges
	const adjCount = new Int32Array(numRegions)
	for (let r = 0; r < numRegions; r++) {
		const s0 = r_s[r]
		if (s0 === -1) continue
		let s = s0
		do {
			adjCount[r]++
			s = nextSide(hes[s])
		} while (s !== s0)
	}

	const adjOffset = new Int32Array(numRegions + 1)
	for (let r = 0; r < numRegions; r++) {
		adjOffset[r + 1] = adjOffset[r] + adjCount[r]
	}

	const totalAdj = adjOffset[numRegions]
	const adjList = new Int32Array(totalAdj)
	const adjTriList = new Int32Array(totalAdj)

	for (let r = 0; r < numRegions; r++) {
		const s0 = r_s[r]
		if (s0 === -1) continue
		let s = s0
		let idx = adjOffset[r]
		do {
			adjList[idx] = tris[nextSide(s)] // s_end_r
			adjTriList[idx] = (s / 3) | 0 // s_inner_t
			idx++
			s = nextSide(hes[s])
		} while (s !== s0)
	}

	// Neighbor distances
	const neighborDist = new Float32Array(totalAdj)
	for (let r = 0; r < numRegions; r++) {
		const ax = r_xyz[3 * r],
			ay = r_xyz[3 * r + 1],
			az = r_xyz[3 * r + 2]
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			const nb = adjList[j]
			const dx = ax - r_xyz[3 * nb]
			const dy = ay - r_xyz[3 * nb + 1]
			const dz = az - r_xyz[3 * nb + 2]
			neighborDist[j] = Math.sqrt(dx * dx + dy * dy + dz * dz)
		}
	}

	// Halfedge helpers as flat arrays
	const s_begin_r = new Int32Array(numSides)
	const s_end_r = new Int32Array(numSides)
	const s_inner_t = new Int32Array(numSides)
	const s_outer_t = new Int32Array(numSides)

	for (let s = 0; s < numSides; s++) {
		s_begin_r[s] = tris[s]
		s_end_r[s] = tris[nextSide(s)]
		s_inner_t[s] = (s / 3) | 0
		const opp = hes[s]
		s_outer_t[s] = opp >= 0 ? (opp / 3) | 0 : -1
	}

	// Triangle centers (Voronoi vertices on the sphere)
	const t_xyz = new Float32Array(3 * numTriangles)
	for (let t = 0; t < numTriangles; t++) {
		const s0 = 3 * t
		const a = tris[s0],
			b = tris[s0 + 1],
			c = tris[s0 + 2]
		let cx = r_xyz[3 * a] + r_xyz[3 * b] + r_xyz[3 * c]
		let cy = r_xyz[3 * a + 1] + r_xyz[3 * b + 1] + r_xyz[3 * c + 1]
		let cz = r_xyz[3 * a + 2] + r_xyz[3 * b + 2] + r_xyz[3 * c + 2]
		const len = Math.sqrt(cx * cx + cy * cy + cz * cz)
		if (len > 0) {
			cx /= len
			cy /= len
			cz /= len
		}
		t_xyz[3 * t] = cx
		t_xyz[3 * t + 1] = cy
		t_xyz[3 * t + 2] = cz
	}

	return {
		numRegions,
		numTriangles,
		numSides,
		r_xyz,
		t_xyz,
		triangles: tris,
		halfedges: hes,
		adjOffset,
		adjList,
		neighborDist,
		s_begin_r,
		s_end_r,
		s_inner_t,
		s_outer_t,
	}
}
