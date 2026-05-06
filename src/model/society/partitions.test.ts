import { describe, expect, it } from "vitest"
import type { OrogenPartition } from ".."
import { computeCultures } from "./culture"
import { computeFaiths } from "./faith"
import { computeHeritages } from "./heritage"
import { computeReligions } from "./religion"

/** Build a ring graph of `n` nodes for use as provinces or partitions. */
function buildRingProvinces(n: number) {
	const adjOffset = new Int32Array(n + 1)
	const adjList = new Int32Array(n * 2)
	for (let i = 0; i < n; i++) {
		adjOffset[i] = i * 2
		adjList[i * 2] = (i - 1 + n) % n
		adjList[i * 2 + 1] = (i + 1) % n
	}
	adjOffset[n] = n * 2
	return {
		count: n,
		desolate: new Uint8Array(n),
		adjOffset,
		adjList,
	}
}

/** Wrap a flat ring of `n` nodes as an OrogenPartition (one node per partition). */
function buildRingPartition(n: number, sizeFill = 1): OrogenPartition {
	const adjOffset = new Int32Array(n + 1)
	const adjList = new Int32Array(n * 2)
	for (let i = 0; i < n; i++) {
		adjOffset[i] = i * 2
		adjList[i * 2] = (i - 1 + n) % n
		adjList[i * 2 + 1] = (i + 1) % n
	}
	adjOffset[n] = n * 2
	return {
		count: n,
		assignment: Int32Array.from({ length: n }, (_, i) => i),
		seeds: Int32Array.from({ length: n }, (_, i) => i),
		adjOffset,
		adjList,
		size: new Int32Array(n).fill(sizeFill),
		colors: new Float32Array(n * 3),
	}
}

const SEED = 42

describe("computeCultures", () => {
	it("produces approximately 1/17 as many cultures as active provinces", () => {
		const provinces = buildRingProvinces(170)
		const cultures = computeCultures(provinces, SEED)
		const target = Math.floor(170 / 17)
		expect(cultures.count).toBeGreaterThanOrEqual(Math.floor(target * 0.7))
		expect(cultures.count).toBeLessThanOrEqual(Math.ceil(target * 1.3))
	})

	it("assigns every active province to a culture", () => {
		const provinces = buildRingProvinces(51)
		const cultures = computeCultures(provinces, SEED)
		const assigned = Array.from(cultures.assignment).filter(
			(a) => a >= 0,
		).length
		expect(assigned).toBe(51)
	})

	it("skips desolate provinces", () => {
		const provinces = buildRingProvinces(50)
		provinces.desolate[0] = 1
		const cultures = computeCultures(provinces, SEED)
		expect(cultures.assignment[0]).toBe(-1)
	})

	it("is deterministic", () => {
		const provinces = buildRingProvinces(85)
		const a = computeCultures(provinces, SEED)
		const b = computeCultures(provinces, SEED)
		expect(Array.from(a.assignment)).toEqual(Array.from(b.assignment))
		expect(a.count).toBe(b.count)
	})
})

describe("computeHeritages", () => {
	it("produces approximately 1/4 as many heritages as active cultures", () => {
		const cultures = buildRingPartition(40)
		const heritages = computeHeritages(cultures, SEED)
		const target = Math.floor(40 / 4)
		expect(heritages.count).toBeGreaterThanOrEqual(Math.floor(target * 0.7))
		expect(heritages.count).toBeLessThanOrEqual(Math.ceil(target * 1.3))
	})

	it("assigns every active culture to a heritage", () => {
		const cultures = buildRingPartition(20)
		const heritages = computeHeritages(cultures, SEED)
		const assigned = Array.from(heritages.assignment).filter(
			(a) => a >= 0,
		).length
		expect(assigned).toBe(20)
	})

	it("is deterministic", () => {
		const cultures = buildRingPartition(40)
		const a = computeHeritages(cultures, SEED)
		const b = computeHeritages(cultures, SEED)
		expect(Array.from(a.assignment)).toEqual(Array.from(b.assignment))
		expect(a.count).toBe(b.count)
	})
})

describe("computeFaiths", () => {
	it("produces approximately 1/2 as many faiths as active cultures", () => {
		const cultures = buildRingPartition(40)
		const faiths = computeFaiths(cultures, SEED)
		const target = Math.floor(40 / 2)
		expect(faiths.count).toBeGreaterThanOrEqual(Math.floor(target * 0.7))
		expect(faiths.count).toBeLessThanOrEqual(Math.ceil(target * 1.3))
	})

	it("assigns every active culture to a faith", () => {
		const cultures = buildRingPartition(20)
		const faiths = computeFaiths(cultures, SEED)
		const assigned = Array.from(faiths.assignment).filter((a) => a >= 0).length
		expect(assigned).toBe(20)
	})

	it("is deterministic", () => {
		const cultures = buildRingPartition(40)
		const a = computeFaiths(cultures, SEED)
		const b = computeFaiths(cultures, SEED)
		expect(Array.from(a.assignment)).toEqual(Array.from(b.assignment))
		expect(a.count).toBe(b.count)
	})
})

describe("computeReligions", () => {
	it("produces approximately 1/2 as many religions as active faiths", () => {
		const faiths = buildRingPartition(40)
		const religions = computeReligions(faiths, SEED)
		const target = Math.floor(40 / 2)
		expect(religions.count).toBeGreaterThanOrEqual(Math.floor(target * 0.7))
		expect(religions.count).toBeLessThanOrEqual(Math.ceil(target * 1.3))
	})

	it("assigns every active faith to a religion", () => {
		const faiths = buildRingPartition(20)
		const religions = computeReligions(faiths, SEED)
		const assigned = Array.from(religions.assignment).filter(
			(a) => a >= 0,
		).length
		expect(assigned).toBe(20)
	})

	it("is deterministic", () => {
		const faiths = buildRingPartition(40)
		const a = computeReligions(faiths, SEED)
		const b = computeReligions(faiths, SEED)
		expect(Array.from(a.assignment)).toEqual(Array.from(b.assignment))
		expect(a.count).toBe(b.count)
	})
})

describe("partition ratios (cultures → heritages and faiths → religions)", () => {
	it("heritages are ~4x coarser than cultures (matching CK3 avg ~62 counties/heritage)", () => {
		const cultures = buildRingPartition(100)
		const heritages = computeHeritages(cultures, SEED)
		expect(cultures.count / heritages.count).toBeGreaterThanOrEqual(3)
		expect(cultures.count / heritages.count).toBeLessThanOrEqual(6)
	})

	it("faiths are ~2x coarser than cultures (matching CK3 avg ~35 counties/faith)", () => {
		const cultures = buildRingPartition(100)
		const faiths = computeFaiths(cultures, SEED)
		expect(cultures.count / faiths.count).toBeGreaterThanOrEqual(1.5)
		expect(cultures.count / faiths.count).toBeLessThanOrEqual(3)
	})

	it("religions are ~2x coarser than faiths (matching CK3 avg ~75 counties/religion)", () => {
		const faiths = buildRingPartition(100)
		const religions = computeReligions(faiths, SEED)
		expect(faiths.count / religions.count).toBeGreaterThanOrEqual(1.5)
		expect(faiths.count / religions.count).toBeLessThanOrEqual(3)
	})
})
