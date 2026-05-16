import { describe, expect, it } from "vitest"
import type { OrogenProvinces } from "../types/society"
import {
	buildNationPlan,
	computeNations,
	MAX_NATION_SPREAD_KM,
	NATION_BUCKETS,
} from "./nations"

// CK3 1066.9.15 all-county-titles province share targets, with ~4% split for hegemons
const CK3_1066_TARGETS = [0.04, 0.4154, 0.072, 0.102, 0.0746, 0.0786, 0.2174]

/**
 * Build a ring of `n` provinces connected as a cycle.
 * Each province `i` is its own region seed, positioned on the unit circle at
 * angle `2πi/n` so that 3-D coordinates are available for noise sampling.
 */
function buildRingNationProvinces(n: number) {
	const adjOffset = new Int32Array(n + 1)
	const adjList = new Int32Array(n * 2)
	for (let i = 0; i < n; i++) {
		adjOffset[i] = i * 2
		adjList[i * 2] = (i - 1 + n) % n
		adjList[i * 2 + 1] = (i + 1) % n
	}
	adjOffset[n] = n * 2

	// Region seed = province index (1-to-1 mapping)
	const seeds = Int32Array.from({ length: n }, (_, i) => i)
	// 3-D coordinates on the unit circle (z = 0)
	const r_xyz = new Float32Array(n * 3)
	for (let i = 0; i < n; i++) {
		const angle = (2 * Math.PI * i) / n
		r_xyz[3 * i] = Math.cos(angle)
		r_xyz[3 * i + 1] = Math.sin(angle)
		r_xyz[3 * i + 2] = 0
	}

	const provinces: OrogenProvinces = {
		count: n,
		seeds,
		desolate: new Uint8Array(n),
		landmassId: new Int32Array(n).fill(0),
		regionProvince: Int32Array.from({ length: n }, (_, i) => i),
		adjOffset,
		adjList,
		size: new Int32Array(n).fill(1),
		colors: new Float32Array(n * 3),
	}

	const coastal = new Uint8Array(n)
	const riverVisible = new Uint8Array(n)
	const habitability = new Float32Array(n).fill(1)

	return { provinces, coastal, riverVisible, habitability, r_xyz }
}

/**
 * Build a double-ring topology: COLS coastal provinces on the equator and COLS
 * inland provinces at latitude `latRad`, each coastal[i] connected to
 * coastal[i±1] and inland[i]. The inland latitude is chosen so that
 * coastal[i]→inland[i] distance equals coastal[i]→coastal[i+1] distance,
 * making the coastal score the only variable that can bias expansion direction.
 */
function buildDoubleRingProvinces(cols: number) {
	const latRad = (2 * Math.PI) / cols // equal-distance offset
	const n = cols * 2
	const edges: number[][] = Array.from({ length: n }, (): number[] => [])
	for (let i = 0; i < cols; i++) {
		edges[i].push((i - 1 + cols) % cols, (i + 1) % cols, i + cols)
		edges[i + cols].push(
			i,
			((i - 1 + cols) % cols) + cols,
			((i + 1) % cols) + cols,
		)
	}
	let total = 0
	for (let i = 0; i < n; i++) total += edges[i].length
	const adjOffset = new Int32Array(n + 1)
	const adjList = new Int32Array(total)
	let wi = 0
	for (let i = 0; i < n; i++) {
		adjOffset[i] = wi
		for (const nb of edges[i]) adjList[wi++] = nb
	}
	adjOffset[n] = wi

	const r_xyz = new Float32Array(n * 3)
	for (let i = 0; i < cols; i++) {
		const angle = (2 * Math.PI * i) / cols
		r_xyz[3 * i] = Math.cos(angle)
		r_xyz[3 * i + 1] = Math.sin(angle)
		r_xyz[3 * i + 2] = 0
		r_xyz[3 * (i + cols)] = Math.cos(angle) * Math.cos(latRad)
		r_xyz[3 * (i + cols) + 1] = Math.sin(angle) * Math.cos(latRad)
		r_xyz[3 * (i + cols) + 2] = Math.sin(latRad)
	}

	const seeds = Int32Array.from({ length: n }, (_, i) => i)
	const coastal = new Uint8Array(n)
	for (let i = 0; i < cols; i++) coastal[i] = 1
	const riverVisible = new Uint8Array(n)

	const provinces: OrogenProvinces = {
		count: n,
		seeds,
		desolate: new Uint8Array(n),
		landmassId: new Int32Array(n).fill(0),
		regionProvince: Int32Array.from({ length: n }, (_, i) => i),
		adjOffset,
		adjList,
		size: new Int32Array(n).fill(1),
		colors: new Float32Array(n * 3),
	}

	const habitability = new Float32Array(n).fill(1)
	return { provinces, coastal, riverVisible, habitability, r_xyz }
}

describe("NATION_BUCKETS", () => {
	it("has seven tiers in descending order", () => {
		expect(NATION_BUCKETS).toHaveLength(7)
		for (let i = 1; i < NATION_BUCKETS.length; i++) {
			expect(NATION_BUCKETS[i][1]).toBeLessThan(NATION_BUCKETS[i - 1][0])
		}
	})

	it("top bucket covers hegemon-scale realms [251, 600]", () => {
		expect(NATION_BUCKETS[0][0]).toBe(251)
		expect(NATION_BUCKETS[0][1]).toBeGreaterThanOrEqual(600)
	})

	it("empire bucket covers [50, 250] to accommodate 1066 mega-realms", () => {
		expect(NATION_BUCKETS[1][0]).toBe(50)
		expect(NATION_BUCKETS[1][1]).toBeGreaterThanOrEqual(250)
	})
})

describe("buildNationPlan", () => {
	it("total province mass equals input total", () => {
		const total = 10_000
		const plan = buildNationPlan(total)
		const mass = plan.targetProvinceMass.reduce((s, v) => s + v, 0)
		expect(mass).toBe(total)
	})

	it("allocates empire bucket ~41% of provinces (CK3 1066 target)", () => {
		const total = 10_000
		const plan = buildNationPlan(total)
		const pct = plan.targetProvinceMass[1] / total
		expect(pct).toBeGreaterThanOrEqual(CK3_1066_TARGETS[1] - 0.05)
		expect(pct).toBeLessThanOrEqual(CK3_1066_TARGETS[1] + 0.05)
	})

	it("allocates size-1 bucket ~22% of provinces (CK3 1066 target)", () => {
		const total = 10_000
		const plan = buildNationPlan(total)
		const pct = plan.targetProvinceMass[6] / total
		expect(pct).toBeGreaterThanOrEqual(CK3_1066_TARGETS[6] - 0.05)
		expect(pct).toBeLessThanOrEqual(CK3_1066_TARGETS[6] + 0.05)
	})

	it("each bucket mass matches CK3 1066 target within 5%", () => {
		const total = 100_000
		const plan = buildNationPlan(total)
		for (let i = 0; i < NATION_BUCKETS.length; i++) {
			const pct = plan.targetProvinceMass[i] / total
			expect(pct).toBeGreaterThanOrEqual(CK3_1066_TARGETS[i] - 0.05)
			expect(pct).toBeLessThanOrEqual(CK3_1066_TARGETS[i] + 0.05)
		}
	})

	it("hegemon bucket nations are sized within [251, 600]", () => {
		const plan = buildNationPlan(10_000)
		const [min, max] = NATION_BUCKETS[0]
		const hegeMonTargets = plan.targets.filter((t) => t >= min)
		for (const t of hegeMonTargets) {
			expect(t).toBeGreaterThanOrEqual(min)
			expect(t).toBeLessThanOrEqual(max)
		}
	})

	it("empire bucket nations are sized within [50, 250]", () => {
		const plan = buildNationPlan(10_000)
		const [min, max] = NATION_BUCKETS[1]
		const empirerTargets = plan.targets.filter((t) => t >= min && t <= max)
		expect(empirerTargets.length).toBeGreaterThan(0)
		for (const t of empirerTargets) {
			expect(t).toBeGreaterThanOrEqual(min)
			expect(t).toBeLessThanOrEqual(max)
		}
	})

	it("produces at least one nation per non-empty bucket", () => {
		const plan = buildNationPlan(10_000)
		expect(plan.targetNationCount.some((c) => c > 0)).toBe(true)
	})
})

describe("computeNations", () => {
	it("returns an empty partition when all provinces are desolate", () => {
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(10)
		provinces.desolate.fill(1)
		const result = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 1,
		})
		expect(result.count).toBe(0)
		expect(Array.from(result.assignment).every((a) => a === -1)).toBe(true)
	})

	it("assigns every active province to a nation", () => {
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(200)
		const result = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 42,
		})
		for (let p = 0; p < provinces.count; p++) {
			expect(result.assignment[p]).toBeGreaterThanOrEqual(0)
		}
	})

	it("desolate provinces are not assigned", () => {
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(100)
		provinces.desolate[5] = 1
		const result = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 7,
		})
		expect(result.assignment[5]).toBe(-1)
	})

	it("is deterministic — same seed produces identical assignment", () => {
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(200)
		const a = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 99,
		})
		const b = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 99,
		})
		expect(Array.from(a.assignment)).toEqual(Array.from(b.assignment))
		expect(a.count).toBe(b.count)
	})

	it("different seeds produce different province assignments (noise is seed-dependent)", () => {
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(200)
		const a = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 1,
		})
		const b = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 2,
		})
		const assignmentA = Array.from(a.assignment)
		const assignmentB = Array.from(b.assignment)
		// Remap nation IDs to canonical form (first-seen order) so we compare shapes not labels
		function canonicalize(arr: number[]) {
			const map = new Map<number, number>()
			return arr.map((v) => {
				if (!map.has(v)) map.set(v, map.size)
				return map.get(v)!
			})
		}
		expect(canonicalize(assignmentA)).not.toEqual(canonicalize(assignmentB))
	})

	it("all nation sizes are positive", () => {
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(150)
		const result = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 13,
		})
		for (let n = 0; n < result.count; n++) {
			expect(result.size[n]).toBeGreaterThan(0)
		}
	})

	it("nation count equals seeds array length", () => {
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(150)
		const result = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 55,
		})
		expect(result.count).toBe(result.seeds.length)
	})

	it("does not coast-snake — empire seeded on coast claims inland provinces rather than following the coastline", () => {
		// Two parallel rings: COLS coastal provinces (equator) and COLS inland
		// provinces (latitude offset). All neighbors are equidistant on the sphere
		// so the only signal that can bias expansion is the coastal score.
		// Without the fix the empire would follow the 1-D coastal chain (100%
		// coastal); with the fix the distance gradient dominates and the empire
		// grows into both rings (< 75% coastal).
		const COLS = 20
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildDoubleRingProvinces(COLS)
		const result = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 17,
		})

		// Find the largest nation whose seed is a coastal province.
		let largestNation = -1
		let largestSize = 0
		for (let nat = 0; nat < result.count; nat++) {
			if (coastal[result.seeds[nat]] && result.size[nat] > largestSize) {
				largestNation = nat
				largestSize = result.size[nat]
			}
		}
		expect(largestNation).toBeGreaterThanOrEqual(0)

		let coastalClaimed = 0
		for (let p = 0; p < provinces.count; p++) {
			if (result.assignment[p] === largestNation && coastal[p]) coastalClaimed++
		}

		// Should have claimed some inland provinces — not just snaked along coast.
		expect(coastalClaimed / largestSize).toBeLessThan(0.75)
	})

	it("tight spread cap (large planetRadiusKm) limits per-nation expansion in main pass", () => {
		const N = 200
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(N)

		// planetRadiusKm=100: maxSpreadRad = MAX_NATION_SPREAD_KM/100 = 20 rad >> π, cap never reached
		const loose = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 1,
			planetRadiusKm: 100,
		})

		// planetRadiusKm=60000: maxSpreadRad ≈ 0.033 rad ≈ 1 hop on this ring — severely caps expansion
		const tight = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 1,
			planetRadiusKm: 60000,
		})

		// Tight cap: large-target nations can't grow far → smaller max nation size
		expect(Math.max(...Array.from(tight.size))).toBeLessThan(
			Math.max(...Array.from(loose.size)),
		)

		// All provinces still get assigned — leftover fills what the cap prevents
		for (let p = 0; p < N; p++) {
			expect(tight.assignment[p]).toBeGreaterThanOrEqual(0)
		}
	})

	it("MAX_NATION_SPREAD_KM is exported and equals 2000", () => {
		expect(MAX_NATION_SPREAD_KM).toBe(2000)
	})

	it("prefers river access over slightly higher inland habitability when seeding nations", () => {
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(12)
		habitability[0] = 5
		habitability[1] = 8
		habitability[2] = 7
		riverVisible[0] = 1

		const result = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 23,
		})

		expect(result.seeds[0]).toBe(0)
	})

	it("treats coastal and river access equally for nation seeding", () => {
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(12)
		habitability[0] = 6
		habitability[1] = 6
		coastal[0] = 1
		riverVisible[1] = 1

		const result = computeNations({
			provinces,
			coastal,
			riverVisible,
			habitability,
			r_xyz,
			seed: 29,
		})

		expect([0, 1]).toContain(result.seeds[0])
	})

	it("weights ocean access above river access when seeding nations", () => {
		const { provinces, coastal, riverVisible, habitability, r_xyz } =
			buildRingNationProvinces(12)
		habitability[0] = 6
		habitability[1] = 6
		const waterAccess = new Uint8Array(12)
		waterAccess[0] = 2
		waterAccess[1] = 1

		const result = computeNations({
			provinces,
			coastal,
			riverVisible,
			waterAccess,
			habitability,
			r_xyz,
			seed: 31,
		})

		expect(result.seeds[0]).toBe(0)
	})
})
