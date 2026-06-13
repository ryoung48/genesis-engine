import { describe, expect, it } from "vitest"
import type { BoundaryInfo, DistanceFields, PlateVec } from ".."
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import { GENESIS_TERRAIN_FEATURE } from "../types/tectonics"
import { blendElevation, computeDistanceFields } from "./elevation"

function buildMesh() {
	return buildSphereMesh(500, 0.5, createRng(1))
}

function buildBoundaryInfo(regionCount: number): BoundaryInfo {
	return {
		mountain_r: new Set<number>(),
		coastline_r: new Set<number>(),
		ocean_r: new Set<number>(),
		r_stress: new Float32Array(regionCount),
		r_subductFactor: new Float32Array(regionCount),
		r_boundaryType: new Int8Array(regionCount),
		r_bothOcean: new Uint8Array(regionCount),
		r_hasOcean: new Uint8Array(regionCount),
	}
}

function buildDistanceFields(regionCount: number): DistanceFields {
	return {
		distMountain: new Float32Array(regionCount).fill(Infinity),
		distOcean: new Float32Array(regionCount).fill(Infinity),
		distCoastline: new Float32Array(regionCount).fill(Infinity),
		distCoast: new Float32Array(regionCount).fill(Infinity),
		distCoastLand: new Float32Array(regionCount).fill(Infinity),
	}
}

describe("computeDistanceFields", () => {
	it("returns fields with the right shape and seeds distance fields from mountains", () => {
		const mesh = buildMesh()
		const rPlate = new Int32Array(mesh.numRegions)
		const plateIsOcean = new Set([0])
		const boundary = buildBoundaryInfo(mesh.numRegions)
		boundary.mountain_r.add(0)
		boundary.r_subductFactor[0] = 0.1

		const distFields = computeDistanceFields(
			mesh,
			rPlate,
			plateIsOcean,
			boundary,
			42,
		)

		expect(distFields.distMountain.length).toBe(mesh.numRegions)
		expect(distFields.distOcean.length).toBe(mesh.numRegions)
		expect(distFields.distCoastline.length).toBe(mesh.numRegions)
		expect(distFields.distCoast.length).toBe(mesh.numRegions)
		expect(distFields.distCoastLand.length).toBe(mesh.numRegions)
		expect(distFields.distMountain[0]).toBe(0)
	})

	it("computes coast and land-coast distance fields for mixed ocean-land plates", () => {
		const mesh = buildMesh()
		const rPlate = new Int32Array(mesh.numRegions)
		rPlate[0] = 1
		const plateIsOcean = new Set([0])
		const boundary = buildBoundaryInfo(mesh.numRegions)

		const distFields = computeDistanceFields(
			mesh,
			rPlate,
			plateIsOcean,
			boundary,
			7,
		)

		const finiteCoastCount = Array.from(distFields.distCoast).filter(
			(d) => d < Infinity,
		).length
		expect(finiteCoastCount).toBeGreaterThan(0)
	})
})

describe("blendElevation", () => {
	it("elevates oceanic island arcs above sea level with the new cap", () => {
		const mesh = buildMesh()
		const boundary = buildBoundaryInfo(mesh.numRegions)
		boundary.r_boundaryType[0] = 1
		boundary.r_bothOcean[0] = 1
		boundary.r_subductFactor[0] = 0.2
		boundary.r_stress[0] = 1

		const rPlate = new Int32Array(mesh.numRegions)
		const plateVec = new Map<number, PlateVec>([
			[0, { pole: [0, 0, 1], omega: 1 }],
		])
		const plateIsOcean = new Set([0])

		const { elevation, terrainFeatures } = blendElevation(
			mesh,
			rPlate,
			plateVec,
			plateIsOcean,
			buildDistanceFields(mesh.numRegions),
			boundary,
			0,
			1,
			17,
		)

		const islandArcBit = 1 << (GENESIS_TERRAIN_FEATURE.ISLAND_ARC - 1)
		let arcRegions = 0
		let surfacedArcRegions = 0
		let _mountainousArcRegions = 0
		let maxArcElevation = -Infinity
		for (let r = 0; r < mesh.numRegions; r++) {
			if ((terrainFeatures.featureMask[r] & islandArcBit) === 0) continue
			arcRegions++
			if (elevation[r] > 0) surfacedArcRegions++
			if (elevation[r] > 0.22) _mountainousArcRegions++
			if (elevation[r] > maxArcElevation) maxArcElevation = elevation[r]
		}

		expect(arcRegions).toBeGreaterThan(10)
		expect(surfacedArcRegions).toBeGreaterThan(0)
		expect(maxArcElevation).toBeGreaterThan(0)
		expect(maxArcElevation).toBeLessThanOrEqual(0.6)
	})

	it("turns island arcs off when volcanism is zero", () => {
		const mesh = buildMesh()
		const boundary = buildBoundaryInfo(mesh.numRegions)
		boundary.r_boundaryType[0] = 1
		boundary.r_bothOcean[0] = 1
		boundary.r_subductFactor[0] = 0.2
		boundary.r_stress[0] = 1

		const rPlate = new Int32Array(mesh.numRegions)
		const plateVec = new Map<number, PlateVec>([
			[0, { pole: [0, 0, 1], omega: 1 }],
		])
		const plateIsOcean = new Set([0])

		const { terrainFeatures } = blendElevation(
			mesh,
			rPlate,
			plateVec,
			plateIsOcean,
			buildDistanceFields(mesh.numRegions),
			boundary,
			0,
			0,
			17,
		)

		const islandArcBit = 1 << (GENESIS_TERRAIN_FEATURE.ISLAND_ARC - 1)
		let arcRegions = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if ((terrainFeatures.featureMask[r] & islandArcBit) !== 0) arcRegions++
		}

		expect(arcRegions).toBe(0)
	})

	it("executes land elevation paths including mountain dissection, plateau, and interior uplift", () => {
		const mesh = buildMesh()
		const boundary = buildBoundaryInfo(mesh.numRegions)
		boundary.r_stress[0] = 1.0

		const rPlate = new Int32Array(mesh.numRegions)
		const plateVec = new Map<number, PlateVec>([
			[0, { pole: [0, 0, 1], omega: 1 }],
		])
		const plateIsOcean = new Set<number>()

		const distFields = buildDistanceFields(mesh.numRegions)
		distFields.distMountain[0] = 5
		distFields.distCoastLand[0] = 3

		const { elevation, terrainFeatures } = blendElevation(
			mesh,
			rPlate,
			plateVec,
			plateIsOcean,
			distFields,
			boundary,
			0.5,
			0,
			17,
		)

		const interiorBit = 1 << (GENESIS_TERRAIN_FEATURE.CONTINENTAL_INTERIOR - 1)
		expect(terrainFeatures.featureMask[0] & interiorBit).toBeGreaterThan(0)
		for (let r = 0; r < mesh.numRegions; r++) {
			expect(Number.isFinite(elevation[r])).toBe(true)
		}
	})

	it("marks mid-ocean ridge, fracture zone, and trench features on ocean plates", () => {
		const mesh = buildMesh()
		const boundary = buildBoundaryInfo(mesh.numRegions)
		boundary.r_bothOcean[0] = 1
		boundary.r_boundaryType[0] = 2
		boundary.r_stress[0] = 0.5
		boundary.r_bothOcean[1] = 1
		boundary.r_boundaryType[1] = 3
		boundary.r_boundaryType[2] = 1
		boundary.r_stress[2] = 0.5

		const rPlate = new Int32Array(mesh.numRegions)
		const plateVec = new Map<number, PlateVec>([
			[0, { pole: [0, 0, 1], omega: 1 }],
		])
		const plateIsOcean = new Set([0])

		const { terrainFeatures } = blendElevation(
			mesh,
			rPlate,
			plateVec,
			plateIsOcean,
			buildDistanceFields(mesh.numRegions),
			boundary,
			0.5,
			0,
			17,
		)

		const ridgeBit = 1 << (GENESIS_TERRAIN_FEATURE.MID_OCEAN_RIDGE - 1)
		const fractureBit = 1 << (GENESIS_TERRAIN_FEATURE.FRACTURE_ZONE - 1)
		const trenchBit = 1 << (GENESIS_TERRAIN_FEATURE.TRENCH - 1)
		expect(terrainFeatures.featureMask[0] & ridgeBit).toBeGreaterThan(0)
		expect(terrainFeatures.featureMask[1] & fractureBit).toBeGreaterThan(0)
		expect(terrainFeatures.featureMask[2] & trenchBit).toBeGreaterThan(0)
	})

	it("applies coastal roughening for mixed ocean-land plates", () => {
		const mesh = buildMesh()
		const boundary = buildBoundaryInfo(mesh.numRegions)

		const rPlate = new Int32Array(mesh.numRegions)
		rPlate[0] = 1
		const plateVec = new Map<number, PlateVec>([
			[0, { pole: [0, 0, 1], omega: 1 }],
			[1, { pole: [0, 0, 1], omega: 1 }],
		])
		const plateIsOcean = new Set([0])

		const { terrainFeatures } = blendElevation(
			mesh,
			rPlate,
			plateVec,
			plateIsOcean,
			buildDistanceFields(mesh.numRegions),
			boundary,
			0.5,
			0,
			17,
		)

		const coastBit = 1 << (GENESIS_TERRAIN_FEATURE.COASTAL_ROUGHENING - 1)
		let coastalCount = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if (terrainFeatures.featureMask[r] & coastBit) coastalCount++
		}
		expect(coastalCount).toBeGreaterThan(0)
	})
})
