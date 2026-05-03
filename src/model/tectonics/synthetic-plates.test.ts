import { describe, expect, it } from "vitest"
import type { SphereMesh } from ".."
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import {
	buildDummyBoundary,
	buildSyntheticPlates,
	computeSimpleDistanceFields,
	deriveSyntheticPlates,
} from "./synthetic-plates"

function buildMesh(n = 500, seed = 1) {
	return buildSphereMesh(n, 0.5, createRng(seed))
}

function buildLineMesh(numRegions: number): SphereMesh {
	const adjOffset = new Int32Array(numRegions + 1)
	const adjEntries: number[] = []
	for (let r = 0; r < numRegions; r++) {
		adjOffset[r] = adjEntries.length
		if (r > 0) adjEntries.push(r - 1)
		if (r < numRegions - 1) adjEntries.push(r + 1)
	}
	adjOffset[numRegions] = adjEntries.length
	return {
		numRegions,
		adjOffset,
		adjList: Int32Array.from(adjEntries),
		r_xyz: new Float32Array(numRegions * 3),
	} as SphereMesh
}

describe("buildSyntheticPlates", () => {
	it("returnsArrayLengthMatchingPlateIdsInput", () => {
		const plateIds = [10, 20, 30]
		const plateIsOcean = new Set([10])
		const result = buildSyntheticPlates(plateIds, plateIsOcean)
		expect(result.length).toBe(plateIds.length)
	})

	it("marksOceanPlatesCorrectly", () => {
		const plateIds = [0, 1, 2]
		const plateIsOcean = new Set([0, 2])
		const plates = buildSyntheticPlates(plateIds, plateIsOcean)
		expect(plates[0].isOcean).toBe(true)
		expect(plates[1].isOcean).toBe(false)
		expect(plates[2].isOcean).toBe(true)
	})

	it("assignsSequentialIdToEachPlate", () => {
		const plateIds = [5, 10, 15]
		const plates = buildSyntheticPlates(plateIds, new Set())
		plates.forEach((p, i) => {
			expect(p.id).toBe(i)
		})
	})

	it("assignsUnitLengthPoleToEachPlate", () => {
		const plateIds = [0, 1, 2, 3]
		const plates = buildSyntheticPlates(plateIds, new Set())
		for (const p of plates) {
			const [x, y, z] = p.pole
			expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5)
		}
	})

	it("assignsNonNegativeGrowthRateToEachPlate", () => {
		const plateIds = [0, 1, 2]
		const plates = buildSyntheticPlates(plateIds, new Set())
		for (const p of plates) {
			expect(p.growthRate).toBeGreaterThanOrEqual(0)
		}
	})
})

describe("deriveSyntheticPlates", () => {
	it("assignsEveryRegionToAPlate", () => {
		const mesh = buildMesh(300, 42)
		const elevation = new Float32Array(mesh.numRegions)
		for (let r = 0; r < mesh.numRegions; r++) {
			// Half above sea level, half below
			elevation[r] = r < mesh.numRegions / 2 ? 0.3 : -0.3
		}
		const { plateAssignment } = deriveSyntheticPlates(mesh, elevation)
		for (let r = 0; r < mesh.numRegions; r++) {
			expect(plateAssignment[r]).toBeGreaterThanOrEqual(0)
		}
	})

	it("classifiesOceanPlatesFromNegativeElevation", () => {
		const mesh = buildMesh(300, 7)
		// All cells below sea level
		const elevation = new Float32Array(mesh.numRegions).fill(-0.5)
		const { plateIsOcean, plateIds } = deriveSyntheticPlates(mesh, elevation)
		expect(plateIsOcean.size).toBe(plateIds.length)
	})

	it("classifiesLandPlatesFromPositiveElevation", () => {
		const mesh = buildMesh(300, 8)
		// All cells above sea level
		const elevation = new Float32Array(mesh.numRegions).fill(0.5)
		const { plateIsOcean, plateIds } = deriveSyntheticPlates(mesh, elevation)
		expect(plateIsOcean.size).toBe(0)
		expect(plateIds.length).toBeGreaterThan(0)
	})

	it("returnsSamePlateAssignmentForIdenticalInput", () => {
		const mesh = buildMesh(300, 5)
		const elevation = new Float32Array(mesh.numRegions)
		for (let r = 0; r < mesh.numRegions; r++) {
			elevation[r] = Math.sin(r) * 0.5
		}
		const a = deriveSyntheticPlates(mesh, elevation)
		const b = deriveSyntheticPlates(mesh, elevation)
		expect(a.plateAssignment).toEqual(b.plateAssignment)
	})
})

describe("buildDummyBoundary", () => {
	it("marks ocean, coastline, and mountain regions from elevation", () => {
		const mesh = buildLineMesh(4)
		const boundary = buildDummyBoundary(
			mesh,
			new Float32Array([-0.2, 0.4, 0.8, 0.1]),
		)

		expect([...boundary.ocean_r]).toEqual([0])
		expect([...boundary.coastline_r]).toEqual([1])
		expect([...boundary.mountain_r]).toEqual([2])
		expect(boundary.r_stress).toHaveLength(mesh.numRegions)
	})
})

describe("computeSimpleDistanceFields", () => {
	it("derives coast-distance fields from the synthetic land mask", () => {
		const mesh = buildLineMesh(4)
		const fields = computeSimpleDistanceFields(
			mesh,
			new Float32Array([-0.2, 0.4, 0.8, 0.1]),
		)

		expect(Array.from(fields.distCoast)).toEqual([0, 0, 1, 2])
		expect(Array.from(fields.distCoastLand)).toEqual([Infinity, 0, 1, 2])
		expect(fields.distMountain).toHaveLength(mesh.numRegions)
	})
})
