import { describe, expect, it } from "vitest"
import type { OrogenProvinces, SphereMesh } from ".."
import { computeLocations } from "./locations"

function buildRingMesh(n: number): SphereMesh {
	const r_xyz = new Float32Array(n * 3)
	const adjOffset = new Int32Array(n + 1)
	const adjList = new Int32Array(n * 2)
	for (let i = 0; i < n; i++) {
		const angle = (i / n) * Math.PI * 2
		r_xyz[i * 3] = Math.cos(angle)
		r_xyz[i * 3 + 1] = Math.sin(angle)
		r_xyz[i * 3 + 2] = 0
		adjOffset[i] = i * 2
		adjList[i * 2] = (i - 1 + n) % n
		adjList[i * 2 + 1] = (i + 1) % n
	}
	adjOffset[n] = n * 2
	return {
		numRegions: n,
		numTriangles: 0,
		numSides: 0,
		r_xyz,
		t_xyz: new Float32Array(0),
		triangles: new Int32Array(0),
		halfedges: new Int32Array(0),
		adjOffset,
		adjList,
		neighborDist: new Float32Array(0),
		s_begin_r: new Int32Array(0),
		s_end_r: new Int32Array(0),
		s_inner_t: new Int32Array(0),
		s_outer_t: new Int32Array(0),
	} as unknown as SphereMesh
}

function buildLinearProvinces(n: number, provCount: number): OrogenProvinces {
	const regionProvince = new Int32Array(n)
	const regionsPerProv = Math.ceil(n / provCount)
	for (let r = 0; r < n; r++) {
		regionProvince[r] = Math.min(Math.floor(r / regionsPerProv), provCount - 1)
	}
	const seeds = new Int32Array(provCount)
	const size = new Int32Array(provCount)
	for (let p = 0; p < provCount; p++) {
		seeds[p] = p * regionsPerProv
		for (let r = 0; r < n; r++) {
			if (regionProvince[r] === p) size[p]++
		}
	}
	const adjOffset = new Int32Array(provCount + 1)
	const adjList = new Int32Array(provCount * 2)
	for (let p = 0; p < provCount; p++) {
		adjOffset[p] = p * 2
		adjList[p * 2] = (p - 1 + provCount) % provCount
		adjList[p * 2 + 1] = (p + 1) % provCount
	}
	adjOffset[provCount] = provCount * 2
	return {
		regionProvince,
		seeds,
		count: provCount,
		desolate: new Uint8Array(provCount),
		landmassId: new Int32Array(provCount),
		adjOffset,
		adjList,
		size,
		colors: new Float32Array(provCount * 3),
	}
}

const SEED = 42
// planetRadiusKm chosen so that the geometric cell-area fallback yields
// ~PROVINCE_AREA_TARGET_KM2 / 3 per location for a 10-cell province on a 90-region mesh.
const TEST_PLANET_RADIUS_KM = 150
const OPTS = { planetRadiusKm: TEST_PLANET_RADIUS_KM }

describe("computeLocations", () => {
	it("assigns every region that is in a province to a location", () => {
		const mesh = buildRingMesh(30)
		const provinces = buildLinearProvinces(30, 3)
		const locs = computeLocations(provinces, mesh, SEED, OPTS)
		for (let r = 0; r < 30; r++) {
			expect(locs.regionLocation[r]).toBeGreaterThanOrEqual(0)
		}
	})

	it("produces ~3 locations per province for standard-sized provinces", () => {
		// 9 provinces × 10 cells each; with TEST_PLANET_RADIUS_KM each cell is ~1047 km²,
		// giving round(10470 / 3333) = 3 locations per province → 27 total.
		const mesh = buildRingMesh(90)
		const provinces = buildLinearProvinces(90, 9)
		const locs = computeLocations(provinces, mesh, SEED, OPTS)
		expect(locs.count).toBeGreaterThanOrEqual(18)
		expect(locs.count).toBeLessThanOrEqual(45)
	})

	it("every location belongs to a valid province", () => {
		const mesh = buildRingMesh(30)
		const provinces = buildLinearProvinces(30, 3)
		const locs = computeLocations(provinces, mesh, SEED, OPTS)
		for (let l = 0; l < locs.count; l++) {
			expect(locs.locationProvince[l]).toBeGreaterThanOrEqual(0)
			expect(locs.locationProvince[l]).toBeLessThan(provinces.count)
		}
	})

	it("no location crosses province boundaries", () => {
		const mesh = buildRingMesh(30)
		const provinces = buildLinearProvinces(30, 3)
		const locs = computeLocations(provinces, mesh, SEED, OPTS)
		for (let r = 0; r < 30; r++) {
			const l = locs.regionLocation[r]
			expect(locs.locationProvince[l]).toBe(provinces.regionProvince[r])
		}
	})

	it("every province with regions has at least 1 location", () => {
		const mesh = buildRingMesh(30)
		const provinces = buildLinearProvinces(30, 3)
		const locs = computeLocations(provinces, mesh, SEED, OPTS)
		const locPerProvince = new Int32Array(provinces.count)
		for (let l = 0; l < locs.count; l++)
			locPerProvince[locs.locationProvince[l]]++
		for (let p = 0; p < provinces.count; p++) {
			expect(locPerProvince[p]).toBeGreaterThanOrEqual(1)
		}
	})

	it("seeds array references valid regions", () => {
		const mesh = buildRingMesh(30)
		const provinces = buildLinearProvinces(30, 3)
		const locs = computeLocations(provinces, mesh, SEED, OPTS)
		for (let l = 0; l < locs.count; l++) {
			expect(locs.seeds[l]).toBeGreaterThanOrEqual(0)
			expect(locs.seeds[l]).toBeLessThan(30)
		}
	})

	it("adjacency list only contains valid location indices", () => {
		const mesh = buildRingMesh(30)
		const provinces = buildLinearProvinces(30, 3)
		const locs = computeLocations(provinces, mesh, SEED, OPTS)
		for (let i = 0; i < locs.adjList.length; i++) {
			expect(locs.adjList[i]).toBeGreaterThanOrEqual(0)
			expect(locs.adjList[i]).toBeLessThan(locs.count)
		}
	})

	it("is deterministic", () => {
		const mesh = buildRingMesh(60)
		const provinces = buildLinearProvinces(60, 6)
		const a = computeLocations(provinces, mesh, SEED, OPTS)
		const b = computeLocations(provinces, mesh, SEED, OPTS)
		expect(Array.from(a.regionLocation)).toEqual(Array.from(b.regionLocation))
		expect(a.count).toBe(b.count)
	})

	it("larger provinces get more locations than smaller provinces", () => {
		// Build a mesh where one province has 2x as many cells as another.
		// The bigger province should produce more locations.
		const N = 90
		const mesh = buildRingMesh(N)

		// Province 0: cells 0–59 (60 cells), Province 1: cells 60–89 (30 cells)
		const regionProvince = new Int32Array(N)
		const size = new Int32Array(2)
		for (let r = 0; r < N; r++) {
			regionProvince[r] = r < 60 ? 0 : 1
			size[regionProvince[r]]++
		}
		const provAdjOffset = new Int32Array(3)
		const provAdjList = new Int32Array(2)
		provAdjOffset[0] = 0
		provAdjOffset[1] = 1
		provAdjOffset[2] = 2
		provAdjList[0] = 1
		provAdjList[1] = 0
		const provinces: OrogenProvinces = {
			regionProvince,
			seeds: new Int32Array([0, 60]),
			count: 2,
			desolate: new Uint8Array(2),
			landmassId: new Int32Array(2),
			adjOffset: provAdjOffset,
			adjList: provAdjList,
			size,
			colors: new Float32Array(6),
		}

		const locs = computeLocations(provinces, mesh, SEED, OPTS)

		const locPerProvince = new Int32Array(2)
		for (let l = 0; l < locs.count; l++)
			locPerProvince[locs.locationProvince[l]]++
		expect(locPerProvince[0]).toBeGreaterThan(locPerProvince[1])
	})
})
