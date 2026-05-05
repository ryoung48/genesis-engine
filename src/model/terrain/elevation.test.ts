import { describe, expect, it } from "vitest"
import type { BoundaryInfo, DistanceFields, PlateVec } from ".."
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import { OROGEN_TERRAIN_FEATURE } from "../types/tectonics"
import { blendElevation } from "./elevation"

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

describe("blendElevation", () => {
	it("keeps legacy oceanic island arcs mostly submerged under the old cap", () => {
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
			0,
			17,
		)

		const islandArcBit = 1 << (OROGEN_TERRAIN_FEATURE.ISLAND_ARC - 1)
		let arcRegions = 0
		let surfacedArcRegions = 0
		let mountainousArcRegions = 0
		let maxArcElevation = -Infinity
		for (let r = 0; r < mesh.numRegions; r++) {
			if ((terrainFeatures.featureMask[r] & islandArcBit) === 0) continue
			arcRegions++
			if (elevation[r] > 0) surfacedArcRegions++
			if (elevation[r] > 0.22) mountainousArcRegions++
			if (elevation[r] > maxArcElevation) maxArcElevation = elevation[r]
		}

		expect(arcRegions).toBeGreaterThan(10)
		expect(surfacedArcRegions).toBeLessThanOrEqual(1)
		expect(mountainousArcRegions).toBe(0)
		expect(maxArcElevation).toBeLessThanOrEqual(0.2)
	})
})
