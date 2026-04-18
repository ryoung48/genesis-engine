import { describe, expect, it } from "vitest"
import { buildSphereMesh } from "./mesh"
import { createRng } from "./util/rng"

const POINTS = 500

function buildMesh(seed = 1, jitter = 0.5) {
	return buildSphereMesh(POINTS, jitter, createRng(seed))
}

describe("buildSphereMesh", () => {
	it("returnsNPlusOneRegionsToAccountForPoleClosure", () => {
		const mesh = buildMesh()
		expect(mesh.numRegions).toBe(POINTS + 1)
	})

	it("placesEveryRegionOnUnitSphere", () => {
		const mesh = buildMesh()
		for (let r = 0; r < mesh.numRegions; r++) {
			const x = mesh.r_xyz[3 * r]
			const y = mesh.r_xyz[3 * r + 1]
			const z = mesh.r_xyz[3 * r + 2]
			expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5)
		}
	})

	it("producesAdjacencyOffsetOfLengthNumRegionsPlusOne", () => {
		const mesh = buildMesh()
		expect(mesh.adjOffset.length).toBe(mesh.numRegions + 1)
	})

	it("producesSymmetricAdjacency", () => {
		const mesh = buildMesh()
		for (let r = 0; r < mesh.numRegions; r++) {
			for (let j = mesh.adjOffset[r]; j < mesh.adjOffset[r + 1]; j++) {
				const nb = mesh.adjList[j]
				let reciprocated = false
				for (let k = mesh.adjOffset[nb]; k < mesh.adjOffset[nb + 1]; k++) {
					if (mesh.adjList[k] === r) {
						reciprocated = true
						break
					}
				}
				expect(reciprocated).toBe(true)
			}
		}
	})

	it("assignsAtLeastThreeNeighborsPerRegion", () => {
		const mesh = buildMesh()
		for (let r = 0; r < mesh.numRegions; r++) {
			const degree = mesh.adjOffset[r + 1] - mesh.adjOffset[r]
			expect(degree).toBeGreaterThanOrEqual(3)
		}
	})

	it("producesPositiveNeighborDistances", () => {
		const mesh = buildMesh()
		for (let i = 0; i < mesh.neighborDist.length; i++) {
			expect(mesh.neighborDist[i]).toBeGreaterThan(0)
		}
	})

	it("isDeterministicForSameSeed", () => {
		const a = buildMesh(42)
		const b = buildMesh(42)
		expect(a.r_xyz).toEqual(b.r_xyz)
		expect(a.adjList).toEqual(b.adjList)
	})

	it("producesDifferentGeometryForDifferentSeed", () => {
		const a = buildMesh(1)
		const b = buildMesh(2)
		let anyDiff = false
		for (let i = 0; i < a.r_xyz.length; i++) {
			if (a.r_xyz[i] !== b.r_xyz[i]) {
				anyDiff = true
				break
			}
		}
		expect(anyDiff).toBe(true)
	})
})
