import { describe, expect, it } from "vitest"
import type { SphereMesh } from ".."
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import {
	computeMantleField,
	normalizeMantleField,
	projectMantleFieldToRegions,
} from "./mantle"

function buildMesh(coords: number[], adjacency: number[][]): SphereMesh {
	const adjOffset = new Int32Array(adjacency.length + 1)
	const adjEntries = adjacency.flat()
	for (let i = 0; i < adjacency.length; i++) {
		adjOffset[i] = adjacency
			.slice(0, i)
			.reduce((sum, row) => sum + row.length, 0)
	}
	adjOffset[adjacency.length] = adjEntries.length
	return {
		numRegions: adjacency.length,
		adjOffset,
		adjList: Int32Array.from(adjEntries),
		r_xyz: new Float32Array(coords),
	} as SphereMesh
}

describe("normalizeMantleField", () => {
	it("returns null when the field has no meaningful magnitude", () => {
		expect(normalizeMantleField(new Float32Array([0, 0, 0]))).toBeNull()
	})

	it("scales values by the largest absolute magnitude", () => {
		expect(normalizeMantleField(new Float32Array([2, -4, 1]))).toEqual(
			new Float32Array([0.5, -1, 0.25]),
		)
	})
})

describe("projectMantleFieldToRegions", () => {
	it("preserves spatial mantle variation within a single plate", () => {
		const coarseMesh = buildSphereMesh(300, 0.5, createRng(2))
		const mesh = buildSphereMesh(1500, 0.5, createRng(3))
		const coarseMantleField = new Float32Array(coarseMesh.numRegions)
		for (let r = 0; r < coarseMesh.numRegions; r++) {
			coarseMantleField[r] = coarseMesh.r_xyz[3 * r + 2]
		}

		const projected = projectMantleFieldToRegions(
			coarseMantleField,
			coarseMesh,
			mesh,
		)
		const samples = Array.from({ length: mesh.numRegions }, (_, r) => ({
			mantle: projected[r],
			z: mesh.r_xyz[3 * r + 2],
		})).sort((a, b) => a.z - b.z)
		const bucketSize = Math.max(1, Math.floor(samples.length * 0.1))
		let bottomMean = 0
		let topMean = 0
		for (let i = 0; i < bucketSize; i++) {
			bottomMean += samples[i].mantle
			topMean += samples[samples.length - 1 - i].mantle
		}
		bottomMean /= bucketSize
		topMean /= bucketSize

		expect(topMean).toBeGreaterThan(0.6)
		expect(bottomMean).toBeLessThan(-0.6)
	})

	it("falls back to an exhaustive scan when local walking stalls early", () => {
		const coarseMesh = buildMesh(
			[1, 0, 0, 0, 1, 0, 0, 0, 1, -1, 0, 0],
			[[1], [0, 2], [1], [2]],
		)
		const mesh = buildMesh([-1, 0, 0], [[]])
		const projected = projectMantleFieldToRegions(
			new Float32Array([10, 20, 30, 40]),
			coarseMesh,
			mesh,
		)

		expect(Array.from(projected)).toEqual([40])
	})

	it("uses neighbor walking when the nearest coarse region is found locally", () => {
		const coarseMesh = buildMesh(
			[1, 0, 0, 0, 1, 0, -1, 0, 0],
			[[1], [0, 2], [1]],
		)
		const mesh = buildMesh([0, 0.98, 0.02], [[]])
		const projected = projectMantleFieldToRegions(
			new Float32Array([10, 20, 30]),
			coarseMesh,
			mesh,
		)

		expect(Array.from(projected)).toEqual([20])
	})

	it("defaults to zero when the nearest coarse region has no sampled mantle value", () => {
		const coarseMesh = buildMesh([1, 0, 0, 0, 1, 0], [[1], [0]])
		const mesh = buildMesh([0, 1, 0], [[]])
		const projected = projectMantleFieldToRegions(
			new Float32Array([10]),
			coarseMesh,
			mesh,
		)

		expect(Array.from(projected)).toEqual([0])
	})
})

describe("computeMantleField", () => {
	it("returns an empty mantle field for an empty mesh", () => {
		const emptyMesh = buildMesh([], [])
		const mantleField = computeMantleField(
			new Map(),
			[],
			new Set<number>(),
			new Int32Array(),
			emptyMesh,
			5,
		)

		expect(mantleField).toEqual(new Float32Array())
		expect(normalizeMantleField(mantleField)).toBeNull()
	})

	it("handles unused zero-area seed plates without producing NaNs", () => {
		const mesh = buildMesh([1, 0, 0, -1, 0, 0], [[1], [0]])
		const mantleField = computeMantleField(
			new Map([
				[0, { pole: [0, 0, 1] as [number, number, number], omega: 0.8 }],
				[2, { pole: [0, 1, 0] as [number, number, number], omega: -0.4 }],
			]),
			[0, 2],
			new Set<number>([0]),
			new Int32Array([0, 0]),
			mesh,
			41,
		)

		expect(mantleField).toHaveLength(2)
		for (const value of mantleField) expect(Number.isFinite(value)).toBe(true)
	})

	it("falls back from crowded convergence sampling to the nearest upwelling candidates", () => {
		const mesh = buildMesh(
			[1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
			[
				[2, 3],
				[2, 3],
				[0, 1],
				[0, 1],
			],
		)

		for (const seed of [1, 2, 3, 4, 5, 6]) {
			const mantleField = computeMantleField(
				new Map([
					[0, { pole: [0, 0, 1] as [number, number, number], omega: -1 }],
					[1, { pole: [0, 0, 1] as [number, number, number], omega: 1 }],
				]),
				[0, 1],
				new Set<number>(),
				new Int32Array([0, 0, 1, 1]),
				mesh,
				seed,
			)

			expect(mantleField).toHaveLength(mesh.numRegions)
			for (const value of mantleField) expect(Number.isFinite(value)).toBe(true)
		}
	})

	it("produces a signed mantle field that can be normalized for hotspot biasing", () => {
		const mesh = buildSphereMesh(500, 0.5, createRng(1))
		const mantleField = computeMantleField(
			new Map([[0, { pole: [0, 0, 1] as [number, number, number], omega: 1 }]]),
			[0],
			new Set<number>([0]),
			new Int32Array(mesh.numRegions),
			mesh,
			123,
		)
		const normalized = normalizeMantleField(mantleField)

		let min = Infinity
		let max = -Infinity
		for (let r = 0; r < mantleField.length; r++) {
			min = Math.min(min, mantleField[r])
			max = Math.max(max, mantleField[r])
		}

		expect(max).toBeGreaterThan(min)
		expect(normalized).not.toBeNull()
		for (const value of normalized ?? []) {
			expect(value).toBeGreaterThanOrEqual(-1)
			expect(value).toBeLessThanOrEqual(1)
		}
	})

	it("falls back to synthetic mantle cells when convergence points are unavailable", () => {
		const mesh = buildSphereMesh(400, 0.5, createRng(11))
		const mantleField = computeMantleField(
			new Map(),
			[],
			new Set<number>(),
			new Int32Array(mesh.numRegions),
			mesh,
			77,
		)
		const normalized = normalizeMantleField(mantleField)

		expect(mantleField).toHaveLength(mesh.numRegions)
		expect(Math.max(...mantleField)).toBeGreaterThan(0)
		expect(normalized).not.toBeNull()
	})

	it("handles converging oceanic and continental plates with extreme size scaling", () => {
		const mesh = buildSphereMesh(600, 0.5, createRng(17))
		const r_plate = new Int32Array(mesh.numRegions)
		for (let r = 0; r < mesh.numRegions; r++) {
			const x = mesh.r_xyz[3 * r]
			const y = mesh.r_xyz[3 * r + 1]
			r_plate[r] = x > 0.2 ? 0 : y > 0.85 ? 2 : 1
		}

		const mantleField = computeMantleField(
			new Map([
				[0, { pole: [0, 0, 1] as [number, number, number], omega: 1 }],
				[1, { pole: [0, 0, 1] as [number, number, number], omega: -1 }],
				[2, { pole: [0, 1, 0] as [number, number, number], omega: 0.75 }],
			]),
			[0, 1, 2],
			new Set<number>([0]),
			r_plate,
			mesh,
			31,
		)
		const normalized = normalizeMantleField(mantleField)

		expect(normalized).not.toBeNull()
		expect(Math.min(...mantleField)).toBeLessThan(0)
		expect(Math.max(...mantleField)).toBeGreaterThan(0)
		expect(
			new Set(Array.from(mantleField, (value) => Math.sign(value))).size,
		).toBeGreaterThan(1)
	})

	it("falls back to synthetic cells when all plates are oceanic and vectors are missing", () => {
		const mesh = buildSphereMesh(450, 0.5, createRng(23))
		const r_plate = new Int32Array(mesh.numRegions)
		for (let r = 0; r < mesh.numRegions; r++) {
			r_plate[r] = mesh.r_xyz[3 * r] >= 0 ? 0 : 1
		}

		const mantleField = computeMantleField(
			new Map([
				[0, { pole: [0, 0, 1] as [number, number, number], omega: 0.6 }],
			]),
			[0, 1],
			new Set<number>([0, 1]),
			r_plate,
			mesh,
			91,
		)
		const normalized = normalizeMantleField(mantleField)

		expect(normalized).not.toBeNull()
		expect(Math.max(...mantleField)).toBeGreaterThan(0)
		expect(
			new Set(Array.from(mantleField, (value) => value.toFixed(3))).size,
		).toBeGreaterThan(10)
	})
})
