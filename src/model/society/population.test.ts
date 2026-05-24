import { describe, expect, it } from "vitest"

import { createRng } from "../shared/rng"
import type { OrogenLandmarks } from "../terrain/landmarks"
import type { OrogenProvinces } from "../types/society"
import { computePopulation, computeProvinceHabitability } from "./population"

const HAB_CLIMATE = new Float32Array([
	0, 0.01, 0.1, 0.6, 1.25, 1.0, 0.8, 0.01, 0.01,
])
const HAB_VEGETATION = new Float32Array([0, 0.1, 0.3, 0.8, 1.0, 0.8, 0.6])
const HAB_TOPOGRAPHY = new Float32Array([1.0, 0.6, 0.8, 0.2, 0.6, 0, 0])
const HAB_COASTAL_OCEAN = 1.5
const HAB_COASTAL_RIVER = 1.1

describe("computePopulation", () => {
	it("sums per-region habitability into each province and applies world scoring once", () => {
		const provinces = {
			regionProvince: new Int32Array([0, 0, 1]),
			seeds: new Int32Array([0, 2]),
			count: 2,
			desolate: new Uint8Array([0, 0]),
			landmassId: new Int32Array([0, 0]),
			adjOffset: new Int32Array([0, 0, 0]),
			adjList: new Int32Array(),
			size: new Int32Array([2, 1]),
			colors: new Float32Array(6),
		} satisfies OrogenProvinces
		const landmarks = {
			regionLandmark: new Int32Array([0, 0, 0]),
			type: new Uint8Array([0]),
			size: new Int32Array([3]),
			count: 1,
		} satisfies OrogenLandmarks
		const climateZones = new Uint8Array([4, 1, 4])
		const vegetation = new Uint8Array([4, 4, 4])
		const topography = new Uint8Array([0, 0, 0])
		const oceanCoastal = new Uint8Array([0, 0, 0])
		const lakeCoastal = new Uint8Array([0, 0, 0])
		const riverVisible = new Uint8Array([0, 0, 0])
		const seed = 123

		const result = computePopulation(
			provinces,
			landmarks,
			climateZones,
			vegetation,
			topography,
			oceanCoastal,
			lakeCoastal,
			riverVisible,
			seed,
			1,
			3,
		)

		const rng = createRng(seed + 77777)
		const regionScores = Array.from(climateZones, (climateZone, region) => {
			const randomFactor = 0.8 + rng.random() * 0.4
			return (
				HAB_CLIMATE[climateZone] *
				HAB_VEGETATION[vegetation[region]] *
				HAB_TOPOGRAPHY[topography[region]] *
				randomFactor
			)
		})
		const expectedProvince0 = regionScores[0] + regionScores[1]
		const expectedProvince1 = regionScores[2]
		const cellAreaKm2 = (4 * Math.PI) / 3
		const expectedHabitabilityScore =
			((expectedProvince0 + expectedProvince1) * cellAreaKm2) / 81234131.618

		expect(result.habitability[0]).toBeCloseTo(expectedProvince0, 5)
		expect(result.habitability[1]).toBeCloseTo(expectedProvince1, 5)
		expect(result.habitabilityScore).toBeCloseTo(expectedHabitabilityScore, 12)
		expect(result.totalPopulation).toBeCloseTo(
			215e6 * expectedHabitabilityScore,
			5,
		)
	})

	it("applies province-wide water access to every region while skipping unassigned and desolate regions", () => {
		const provinces = {
			regionProvince: new Int32Array([-1, 0, 0, 1, 2]),
			seeds: new Int32Array([1, 3, 4]),
			count: 3,
			desolate: new Uint8Array([0, 0, 1]),
			landmassId: new Int32Array([0, 0, 0]),
			adjOffset: new Int32Array([0, 0, 0, 0]),
			adjList: new Int32Array(),
			size: new Int32Array([2, 1, 1]),
			colors: new Float32Array(9),
		} satisfies OrogenProvinces
		const landmarks = {
			regionLandmark: new Int32Array([0, 0, 0, 0, 0]),
			type: new Uint8Array([0]),
			size: new Int32Array([5]),
			count: 1,
		} satisfies OrogenLandmarks
		const climateZones = new Uint8Array([4, 4, 4, 4, 4])
		const vegetation = new Uint8Array([4, 4, 4, 4, 4])
		const topography = new Uint8Array([0, 0, 0, 0, 0])
		const oceanCoastal = new Uint8Array([0, 1, 0, 0, 1])
		const lakeCoastal = new Uint8Array([0, 0, 0, 0, 0])
		const riverVisible = new Uint8Array([0, 0, 0, 1, 1])
		const seed = 321

		const result = computePopulation(
			provinces,
			landmarks,
			climateZones,
			vegetation,
			topography,
			oceanCoastal,
			lakeCoastal,
			riverVisible,
			seed,
			1,
			5,
		)

		const rng = createRng(seed + 77777)
		const baseScore = HAB_CLIMATE[4] * HAB_VEGETATION[4] * HAB_TOPOGRAPHY[0]
		// Province 0 has ocean coastal (region 1) → HAB_COASTAL_OCEAN for all its regions
		// Province 1 has river (region 3) → HAB_COASTAL_RIVER
		const regionScores = [
			baseScore * HAB_COASTAL_OCEAN * (0.8 + rng.random() * 0.4), // r=1, prov 0
			baseScore * HAB_COASTAL_OCEAN * (0.8 + rng.random() * 0.4), // r=2, prov 0
			baseScore * HAB_COASTAL_RIVER * (0.8 + rng.random() * 0.4), // r=3, prov 1
		]

		expect(result.habitability[0]).toBeCloseTo(
			regionScores[0] + regionScores[1],
			5,
		)
		expect(result.habitability[1]).toBeCloseTo(regionScores[2], 5)
		expect(result.habitability[2]).toBe(0)
	})

	it("falls back to zero for unsupported region codes and leaves empty worlds unpopulated", () => {
		const provinces = {
			regionProvince: new Int32Array([0]),
			seeds: new Int32Array([0]),
			count: 1,
			desolate: new Uint8Array([0]),
			landmassId: new Int32Array([0]),
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(),
			size: new Int32Array([1]),
			colors: new Float32Array(3),
		} satisfies OrogenProvinces
		const landmarks = {
			regionLandmark: new Int32Array([0]),
			type: new Uint8Array([99]),
			size: new Int32Array([1]),
			count: 1,
		} satisfies OrogenLandmarks

		const result = computePopulation(
			provinces,
			landmarks,
			new Uint8Array([99]),
			new Uint8Array([99]),
			new Uint8Array([99]),
			new Uint8Array([0]),
			new Uint8Array([0]),
			new Uint8Array([0]),
			999,
		)

		expect(result.habitability[0]).toBe(0)
		expect(result.population[0]).toBe(0)
		expect(result.habitabilityScore).toBe(0)
		expect(result.totalPopulation).toBe(0)
	})
})

// ── computeProvinceHabitability ───────────────────────────────────────────────

describe("computeProvinceHabitability", () => {
	it("matches habitability produced by computePopulation for the same inputs", () => {
		const provinces = {
			regionProvince: new Int32Array([0, 0, 1]),
			seeds: new Int32Array([0, 2]),
			count: 2,
			desolate: new Uint8Array([0, 0]),
			landmassId: new Int32Array([0, 0]),
			adjOffset: new Int32Array([0, 0, 0]),
			adjList: new Int32Array(),
			size: new Int32Array([2, 1]),
			colors: new Float32Array(6),
		} satisfies OrogenProvinces
		const landmarks = {
			regionLandmark: new Int32Array([0, 0, 0]),
			type: new Uint8Array([0]),
			size: new Int32Array([3]),
			count: 1,
		} satisfies OrogenLandmarks
		const climateZones = new Uint8Array([4, 1, 4])
		const vegetation = new Uint8Array([4, 4, 4])
		const topography = new Uint8Array([0, 0, 0])
		const coastal = new Uint8Array([0, 0, 0])
		const riverVisible = new Uint8Array([0, 0, 0])
		const seed = 42

		const hab = computeProvinceHabitability(
			provinces,
			landmarks,
			climateZones,
			vegetation,
			topography,
			coastal,
			coastal,
			riverVisible,
			seed,
		)
		const pop = computePopulation(
			provinces,
			landmarks,
			climateZones,
			vegetation,
			topography,
			coastal,
			coastal,
			riverVisible,
			seed,
		)

		expect(hab[0]).toBeCloseTo(pop.habitability[0], 6)
		expect(hab[1]).toBeCloseTo(pop.habitability[1], 6)
	})

	it("returns zero for desolate provinces and skips unassigned regions", () => {
		const provinces = {
			regionProvince: new Int32Array([-1, 0, 1]),
			seeds: new Int32Array([1, 2]),
			count: 2,
			desolate: new Uint8Array([0, 1]),
			landmassId: new Int32Array([0, 0]),
			adjOffset: new Int32Array([0, 0, 0]),
			adjList: new Int32Array(),
			size: new Int32Array([1, 1]),
			colors: new Float32Array(6),
		} satisfies OrogenProvinces
		const landmarks = {
			regionLandmark: new Int32Array([0, 0, 0]),
			type: new Uint8Array([0]),
			size: new Int32Array([3]),
			count: 1,
		} satisfies OrogenLandmarks

		const hab = computeProvinceHabitability(
			provinces,
			landmarks,
			new Uint8Array([4, 4, 4]),
			new Uint8Array([4, 4, 4]),
			new Uint8Array([0, 0, 0]),
			new Uint8Array([0, 0, 0]),
			new Uint8Array([0, 0, 0]),
			new Uint8Array([0, 0, 0]),
			1,
		)

		expect(hab[0]).toBeGreaterThan(0) // province 0 is non-desolate
		expect(hab[1]).toBe(0) // province 1 is desolate
	})

	it("does not reduce habitability for non-continent landmarks", () => {
		const provinces = {
			regionProvince: new Int32Array([0]),
			seeds: new Int32Array([0]),
			count: 1,
			desolate: new Uint8Array([0]),
			landmassId: new Int32Array([0]),
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(),
			size: new Int32Array([1]),
			colors: new Float32Array(3),
		} satisfies OrogenProvinces
		const continentLandmarks = {
			regionLandmark: new Int32Array([0]),
			type: new Uint8Array([0]),
			size: new Int32Array([1]),
			count: 1,
		} satisfies OrogenLandmarks
		const isleLandmarks = {
			regionLandmark: new Int32Array([0]),
			type: new Uint8Array([2]),
			size: new Int32Array([1]),
			count: 1,
		} satisfies OrogenLandmarks

		const continentHabitability = computeProvinceHabitability(
			provinces,
			continentLandmarks,
			new Uint8Array([4]),
			new Uint8Array([4]),
			new Uint8Array([0]),
			new Uint8Array([0]),
			new Uint8Array([0]),
			new Uint8Array([0]),
			17,
		)
		const isleHabitability = computeProvinceHabitability(
			provinces,
			isleLandmarks,
			new Uint8Array([4]),
			new Uint8Array([4]),
			new Uint8Array([0]),
			new Uint8Array([0]),
			new Uint8Array([0]),
			new Uint8Array([0]),
			17,
		)

		expect(continentHabitability[0]).toBeCloseTo(isleHabitability[0], 6)
	})
})

// ── computeMigration ──────────────────────────────────────────────────────────

import type { SphereMesh } from "../types/mesh"
import { computeMigration } from "./population"

/** Minimal SphereMesh stub — only adjOffset/adjList/numRegions are used. */
function makeLinearMesh(numRegions: number): SphereMesh {
	// Build a linear chain: 0-1-2-...(numRegions-1)
	const adjOffsetArr: number[] = [0]
	const adjListArr: number[] = []
	for (let r = 0; r < numRegions; r++) {
		if (r > 0) adjListArr.push(r - 1)
		if (r < numRegions - 1) adjListArr.push(r + 1)
		adjOffsetArr.push(adjListArr.length)
	}
	return {
		numRegions,
		numTriangles: 0,
		numSides: 0,
		r_xyz: new Float32Array(numRegions * 3),
		t_xyz: new Float32Array(0),
		triangles: new Int32Array(0),
		halfedges: new Int32Array(0),
		adjOffset: new Int32Array(adjOffsetArr),
		adjList: new Int32Array(adjListArr),
		neighborDist: new Float32Array(0),
		s_begin_r: new Int32Array(0),
		s_end_r: new Int32Array(0),
		s_inner_t: new Int32Array(0),
		s_outer_t: new Int32Array(0),
	}
}

describe("computeMigration", () => {
	it("returns empty arrays when there are no provinces", () => {
		const emptyProvinces = {
			regionProvince: new Int32Array(0),
			seeds: new Int32Array(0),
			count: 0,
			desolate: new Uint8Array(0),
			landmassId: new Int32Array(0),
			adjOffset: new Int32Array([0]),
			adjList: new Int32Array(0),
			size: new Int32Array(0),
			colors: new Float32Array(0),
		} satisfies OrogenProvinces
		const mesh = makeLinearMesh(0)
		const result = computeMigration(emptyProvinces, new Float32Array(0), mesh)
		expect(result.migrationWave.length).toBe(0)
		expect(result.cradleProvinces.length).toBe(0)
	})

	it("places the single cradle at the most habitable province", () => {
		// 3 provinces, each 1 region, in a chain: p0 (high) - p1 (medium) - p2 (low)
		const provinces = {
			regionProvince: new Int32Array([0, 1, 2]),
			seeds: new Int32Array([0, 1, 2]),
			count: 3,
			desolate: new Uint8Array([0, 0, 0]),
			landmassId: new Int32Array([0, 0, 0]),
			adjOffset: new Int32Array([0, 1, 3, 4]),
			adjList: new Int32Array([1, 0, 2, 1]),
			size: new Int32Array([1, 1, 1]),
			colors: new Float32Array(9),
		} satisfies OrogenProvinces
		const mesh = makeLinearMesh(3)
		// p0 has highest habitability
		const habitability = new Float32Array([3.0, 1.5, 0.5])
		const result = computeMigration(
			provinces,
			habitability,
			mesh,
			1, // tiny planet → 1 cradle
			3,
		)
		expect(result.cradleProvinces[0]).toBe(0)
	})

	it("assigns wave=0 at the cradle and wave=1 at the farthest reachable province", () => {
		const provinces = {
			regionProvince: new Int32Array([0, 1, 2]),
			seeds: new Int32Array([0, 1, 2]),
			count: 3,
			desolate: new Uint8Array([0, 0, 0]),
			landmassId: new Int32Array([0, 0, 0]),
			adjOffset: new Int32Array([0, 1, 3, 4]),
			adjList: new Int32Array([1, 0, 2, 1]),
			size: new Int32Array([1, 1, 1]),
			colors: new Float32Array(9),
		} satisfies OrogenProvinces
		const mesh = makeLinearMesh(3)
		const habitability = new Float32Array([3.0, 1.5, 0.5])
		const result = computeMigration(provinces, habitability, mesh, 1, 3)

		expect(result.migrationWave[0]).toBeCloseTo(0, 5)
		expect(result.migrationWave[2]).toBeCloseTo(1, 5)
		// Intermediate province must be strictly between the endpoints
		expect(result.migrationWave[1]).toBeGreaterThan(0)
		expect(result.migrationWave[1]).toBeLessThan(1)
	})

	it("orders wave values monotonically along a chain from the cradle", () => {
		// 5-region chain; p0 is cradle (most habitable)
		const N = 5
		const adjOff = [0]
		const adjL: number[] = []
		for (let r = 0; r < N; r++) {
			if (r > 0) adjL.push(r - 1)
			if (r < N - 1) adjL.push(r + 1)
			adjOff.push(adjL.length)
		}
		const provinces = {
			regionProvince: new Int32Array(N).map((_, i) => i),
			seeds: new Int32Array(N).map((_, i) => i),
			count: N,
			desolate: new Uint8Array(N),
			landmassId: new Int32Array(N), // all landmass 0
			adjOffset: new Int32Array(adjOff),
			adjList: new Int32Array(adjL),
			size: new Int32Array(N).fill(1),
			colors: new Float32Array(N * 3),
		} satisfies OrogenProvinces
		const mesh = makeLinearMesh(N)
		// Uniform habitability so only distance matters
		const habitability = new Float32Array(N).fill(1.0)
		habitability[0] = 2.0 // make p0 the best
		const result = computeMigration(provinces, habitability, mesh, 1, N)

		for (let i = 1; i < N; i++) {
			expect(result.migrationWave[i]).toBeGreaterThan(
				result.migrationWave[i - 1],
			)
		}
	})

	it("returns wave=-1 for desolate provinces and blocks passage through them", () => {
		// Chain: p0 (habitable) — p1 (desolate barrier) — p2 (habitable but cut off)
		const provinces = {
			regionProvince: new Int32Array([0, 1, 2]),
			seeds: new Int32Array([0, 1, 2]),
			count: 3,
			desolate: new Uint8Array([0, 1, 0]), // p1 is desolate
			landmassId: new Int32Array([0, -1, 0]),
			adjOffset: new Int32Array([0, 1, 3, 4]),
			adjList: new Int32Array([1, 0, 2, 1]),
			size: new Int32Array([1, 1, 1]),
			colors: new Float32Array(9),
		} satisfies OrogenProvinces
		const mesh = makeLinearMesh(3)
		const habitability = new Float32Array([2.0, 0.0, 1.0])
		const result = computeMigration(provinces, habitability, mesh, 1, 3)

		expect(result.migrationWave[1]).toBe(-1) // desolate barrier
		expect(result.migrationWave[0]).toBeGreaterThanOrEqual(0) // cradle
		// p2 is isolated behind the desolate barrier → unreachable
		expect(result.migrationWave[2]).toBe(-1)
	})

	it("allows migration across true ocean gaps (unassigned regions)", () => {
		// Chain: p0 [region 0] — ocean [region 1, province=-1] — p1 [region 2]
		const provinces = {
			regionProvince: new Int32Array([0, -1, 1]),
			seeds: new Int32Array([0, 2]),
			count: 2,
			desolate: new Uint8Array([0, 0]),
			landmassId: new Int32Array([0, 1]),
			adjOffset: new Int32Array([0, 1, 3, 4]),
			adjList: new Int32Array([1, 0, 2, 1]),
			size: new Int32Array([1, 1]),
			colors: new Float32Array(6),
		} satisfies OrogenProvinces
		const mesh = makeLinearMesh(3)
		const habitability = new Float32Array([2.0, 1.0])
		const result = computeMigration(provinces, habitability, mesh, 1, 3)

		expect(result.migrationWave[0]).toBeGreaterThanOrEqual(0) // cradle
		expect(result.migrationWave[1]).toBeGreaterThanOrEqual(0) // reachable via ocean
	})

	it("returns all -1 when all provinces are desolate (empty continent)", () => {
		const provinces = {
			regionProvince: new Int32Array([0, 1]),
			seeds: new Int32Array([0, 1]),
			count: 2,
			desolate: new Uint8Array([1, 1]), // both desolate
			landmassId: new Int32Array([-1, -1]),
			adjOffset: new Int32Array([0, 1, 2]),
			adjList: new Int32Array([1, 0]),
			size: new Int32Array([1, 1]),
			colors: new Float32Array(6),
		} satisfies OrogenProvinces
		const mesh = makeLinearMesh(2)
		const result = computeMigration(
			provinces,
			new Float32Array([0, 0]),
			mesh,
			1,
			2,
		)
		expect(result.migrationWave[0]).toBe(-1)
		expect(result.migrationWave[1]).toBe(-1)
		expect(result.cradleProvinces.length).toBe(0)
	})

	it("marks cradle as wave=0 when it is the only province and has no mesh neighbours", () => {
		// Single region, no mesh edges → Dijkstra seeds it at 0 but maxDist stays 0
		const provinces = {
			regionProvince: new Int32Array([0]),
			seeds: new Int32Array([0]),
			count: 1,
			desolate: new Uint8Array([0]),
			landmassId: new Int32Array([0]),
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(0),
			size: new Int32Array([1]),
			colors: new Float32Array(3),
		} satisfies OrogenProvinces
		// Isolated mesh (no neighbours)
		const mesh: SphereMesh = {
			numRegions: 1,
			numTriangles: 0,
			numSides: 0,
			r_xyz: new Float32Array(3),
			t_xyz: new Float32Array(0),
			triangles: new Int32Array(0),
			halfedges: new Int32Array(0),
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(0),
			neighborDist: new Float32Array(0),
			s_begin_r: new Int32Array(0),
			s_end_r: new Int32Array(0),
			s_inner_t: new Int32Array(0),
			s_outer_t: new Int32Array(0),
		}
		const result = computeMigration(
			provinces,
			new Float32Array([1.0]),
			mesh,
			1,
			1,
		)
		// maxDist === 0, so the else-branch marks the single cradle at 0
		expect(result.migrationWave[0]).toBe(0)
		expect(result.cradleProvinces[0]).toBe(0)
	})

	it("places multiple cradles and spreads monotonically with a large planet radius", () => {
		// 5-province chain. Earth-like radius with N=5 forces ~5 cradles (capped to 5).
		const N = 5
		const adjOff = [0]
		const adjL: number[] = []
		for (let r = 0; r < N; r++) {
			if (r > 0) adjL.push(r - 1)
			if (r < N - 1) adjL.push(r + 1)
			adjOff.push(adjL.length)
		}
		const provinces = {
			regionProvince: new Int32Array(N).map((_, i) => i),
			seeds: new Int32Array(N).map((_, i) => i),
			count: N,
			desolate: new Uint8Array(N),
			landmassId: new Int32Array(N), // all landmass 0
			adjOffset: new Int32Array(adjOff),
			adjList: new Int32Array(adjL),
			size: new Int32Array(N).fill(1),
			colors: new Float32Array(N * 3),
		} satisfies OrogenProvinces
		const mesh = makeLinearMesh(N)
		const habitability = new Float32Array(N).fill(1.0)
		// Earth-like radius forces many cradles → exercises multi-cradle path + bfsUpdateMinHops
		const result = computeMigration(provinces, habitability, mesh, 6371, N)

		// Every province should be reached (wave ≥ 0) with multiple cradles
		for (let i = 0; i < N; i++) {
			expect(result.migrationWave[i]).toBeGreaterThanOrEqual(0)
		}
		// Multiple cradles placed
		expect(result.cradleProvinces.length).toBeGreaterThan(1)
	})
})
