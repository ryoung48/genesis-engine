import { describe, expect, it } from "vitest"
import { buildSphereMesh } from "../mesh"
import { createRng } from "../util/rng"
import {
	computeMantleField,
	normalizeMantleField,
	projectMantleFieldToRegions,
} from "./mantle"

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
})

describe("computeMantleField", () => {
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
})
