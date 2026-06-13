import { describe, expect, it } from "vitest"
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import { GENESIS_TERRAIN_FEATURE } from "../types/tectonics"
import {
	appendLargeIgneousProvinceSites,
	applyLargeIgneousProvinces,
	applyVolcanicArcs,
	buildTangentFrame,
	getLipSpawnChance,
	getLipUpwellingThreshold,
	getScaledFeatureCount,
	getVolcanicActivityThreshold,
	getVolcanicArcSpacing,
	type TerrainFeatureMarker,
} from "./volcanism"

function buildMesh() {
	return buildSphereMesh(500, 0.5, createRng(1))
}

function createFeatureTracker(regionCount: number) {
	const featureMask = new Uint32Array(regionCount)
	const dominantFeature = new Uint8Array(regionCount)
	const dominantMagnitude = new Float32Array(regionCount)
	const markFeature: TerrainFeatureMarker = (r, feature, delta) => {
		const magnitude = Math.abs(delta)
		if (magnitude <= 1e-5) return
		featureMask[r] |= 1 << (feature - 1)
		if (magnitude > dominantMagnitude[r]) {
			dominantMagnitude[r] = magnitude
			dominantFeature[r] = feature
		}
	}
	return { featureMask, dominantFeature, markFeature }
}

describe("volcanism helpers", () => {
	it("scales volcanic feature frequency around the legacy baseline at volcanism 1", () => {
		expect(getScaledFeatureCount(8, 0)).toBe(0)
		expect(getScaledFeatureCount(8, 1)).toBe(8)
		expect(getScaledFeatureCount(8, 4)).toBe(16)
		expect(getVolcanicArcSpacing(0)).toBe(Number.POSITIVE_INFINITY)
		expect(getVolcanicArcSpacing(1)).toBeCloseTo(0.015)
		expect(getVolcanicArcSpacing(4)).toBeLessThan(getVolcanicArcSpacing(1))
		expect(getVolcanicActivityThreshold(0.2, 0)).toBeGreaterThan(1)
		expect(getLipUpwellingThreshold(1)).toBeCloseTo(0.2)
		expect(getLipUpwellingThreshold(10)).toBeLessThan(
			getLipUpwellingThreshold(1),
		)
		expect(getLipSpawnChance(0)).toBe(0)
		expect(getLipSpawnChance(1)).toBe(1)
	})

	it("builds a tangent frame orthogonal to the surface normal", () => {
		const frame = buildTangentFrame(0, 0, 1, 1, 0, 0)
		expect(frame.uz).toBeCloseTo(0)
		expect(frame.vz).toBeCloseTo(0)
		expect(
			frame.ux * frame.vx + frame.uy * frame.vy + frame.uz * frame.vz,
		).toBeCloseTo(0)
	})

	it("stays finite when the drift vector is parallel to the surface normal", () => {
		const frame = buildTangentFrame(0, 0, 1, 0, 0, 3)
		expect(Object.values(frame).every(Number.isFinite)).toBe(true)
		expect(frame).toEqual({ ux: 0, uy: 0, uz: 0, vx: 0, vy: 0, vz: 0 })
	})
})

describe("applyVolcanicArcs", () => {
	it("adds uplift and marks volcanic arc terrain features", () => {
		const mesh = buildMesh()
		const elevation = new Float32Array(mesh.numRegions)
		const boundary = {
			mountain_r: new Set<number>(),
			coastline_r: new Set<number>(),
			ocean_r: new Set<number>(),
			r_stress: new Float32Array(mesh.numRegions),
			r_subductFactor: new Float32Array(mesh.numRegions),
			r_boundaryType: new Int8Array(mesh.numRegions),
			r_bothOcean: new Uint8Array(mesh.numRegions),
			r_hasOcean: new Uint8Array(mesh.numRegions),
		}
		boundary.r_boundaryType[0] = 1
		boundary.r_hasOcean[0] = 1
		boundary.r_stress[0] = 1

		const tracker = createFeatureTracker(mesh.numRegions)
		const uplift = applyVolcanicArcs({
			mesh,
			elevation,
			boundary,
			maxStress: 1,
			seed: 7,
			volcanism: 0.8,
			markFeature: tracker.markFeature,
		})

		expect(uplift[0]).toBeGreaterThan(0)
		expect(elevation[0]).toBeCloseTo(uplift[0])
		expect(tracker.featureMask[0]).toBe(
			1 << (GENESIS_TERRAIN_FEATURE.VOLCANIC_ARC - 1),
		)
		expect(tracker.dominantFeature[0]).toBe(GENESIS_TERRAIN_FEATURE.VOLCANIC_ARC)
	})

	it("keeps oceanic and continental volcanic cone heights identical", () => {
		const mesh = buildMesh()
		const makeBoundary = () => ({
			mountain_r: new Set<number>(),
			coastline_r: new Set<number>(),
			ocean_r: new Set<number>(),
			r_stress: new Float32Array(mesh.numRegions),
			r_subductFactor: new Float32Array(mesh.numRegions),
			r_boundaryType: new Int8Array(mesh.numRegions),
			r_bothOcean: new Uint8Array(mesh.numRegions),
			r_hasOcean: new Uint8Array(mesh.numRegions),
		})

		const oceanBoundary = makeBoundary()
		oceanBoundary.r_boundaryType[0] = 1
		oceanBoundary.r_hasOcean[0] = 1
		oceanBoundary.r_bothOcean[0] = 1
		oceanBoundary.r_stress[0] = 1

		const continentalBoundary = makeBoundary()
		continentalBoundary.r_boundaryType[0] = 1
		continentalBoundary.r_hasOcean[0] = 1
		continentalBoundary.r_stress[0] = 1

		const oceanElevation = new Float32Array(mesh.numRegions)
		oceanElevation[0] = -0.2
		const continentalElevation = new Float32Array(mesh.numRegions)
		continentalElevation[0] = 0.2

		const oceanicUplift = applyVolcanicArcs({
			mesh,
			elevation: oceanElevation,
			boundary: oceanBoundary,
			maxStress: 1,
			seed: 17,
			volcanism: 0.2,
			markFeature: () => undefined,
		})
		const continentalUplift = applyVolcanicArcs({
			mesh,
			elevation: continentalElevation,
			boundary: continentalBoundary,
			maxStress: 1,
			seed: 17,
			volcanism: 0.9,
			markFeature: () => undefined,
		})

		expect(oceanicUplift[0]).toBeGreaterThan(0)
		expect(oceanicUplift[0]).toBeCloseTo(continentalUplift[0])
	})

	it("still generates volcanic uplift when max stress collapses to zero", () => {
		const mesh = buildMesh()
		const elevation = new Float32Array(mesh.numRegions)
		const boundary = {
			mountain_r: new Set<number>(),
			coastline_r: new Set<number>(),
			ocean_r: new Set<number>(),
			r_stress: new Float32Array(mesh.numRegions),
			r_subductFactor: new Float32Array(mesh.numRegions),
			r_boundaryType: new Int8Array(mesh.numRegions),
			r_bothOcean: new Uint8Array(mesh.numRegions),
			r_hasOcean: new Uint8Array(mesh.numRegions),
		}
		boundary.r_boundaryType[0] = 1
		boundary.r_hasOcean[0] = 1

		const uplift = applyVolcanicArcs({
			mesh,
			elevation,
			boundary,
			maxStress: 0,
			seed: 13,
			volcanism: 0.8,
			markFeature: () => undefined,
		})

		expect(uplift[0]).toBeGreaterThan(0)
		expect(elevation[0]).toBeCloseTo(uplift[0])
	})

	it("turns volcanic arcs off when volcanism is zero", () => {
		const mesh = buildMesh()
		const elevation = new Float32Array(mesh.numRegions)
		const boundary = {
			mountain_r: new Set<number>(),
			coastline_r: new Set<number>(),
			ocean_r: new Set<number>(),
			r_stress: Float32Array.from({ length: mesh.numRegions }, (_, i) =>
				i === 0 ? 1 : 0,
			),
			r_subductFactor: new Float32Array(mesh.numRegions),
			r_boundaryType: Int8Array.from({ length: mesh.numRegions }, (_, i) =>
				i === 0 ? 1 : 0,
			),
			r_bothOcean: new Uint8Array(mesh.numRegions),
			r_hasOcean: Uint8Array.from({ length: mesh.numRegions }, (_, i) =>
				i === 0 ? 1 : 0,
			),
		}

		const uplift = applyVolcanicArcs({
			mesh,
			elevation,
			boundary,
			maxStress: 1,
			seed: 7,
			volcanism: 0,
			markFeature: () => undefined,
		})

		expect(Array.from(uplift)).toEqual(new Array(mesh.numRegions).fill(0))
		expect(Array.from(elevation)).toEqual(new Array(mesh.numRegions).fill(0))
	})

	it("skips uplift when candidate boundaries are not subducting enough", () => {
		const mesh = buildMesh()
		const elevation = new Float32Array(mesh.numRegions)
		let featureCalls = 0
		const uplift = applyVolcanicArcs({
			mesh,
			elevation,
			boundary: {
				mountain_r: new Set<number>(),
				coastline_r: new Set<number>(),
				ocean_r: new Set<number>(),
				r_stress: new Float32Array(mesh.numRegions),
				r_subductFactor: Float32Array.from(
					{ length: mesh.numRegions },
					(_, index) => (index === 0 ? 0.5 : 0),
				),
				r_boundaryType: Int8Array.from(
					{ length: mesh.numRegions },
					(_, index) => (index === 0 ? 1 : 0),
				),
				r_bothOcean: new Uint8Array(mesh.numRegions),
				r_hasOcean: Uint8Array.from({ length: mesh.numRegions }, (_, index) =>
					index === 0 ? 1 : 0,
				),
			},
			maxStress: 0,
			seed: 29,
			volcanism: 0.8,
			markFeature: () => {
				featureCalls++
			},
		})

		expect(Array.from(uplift)).toEqual(new Array(mesh.numRegions).fill(0))
		expect(Array.from(elevation)).toEqual(new Array(mesh.numRegions).fill(0))
		expect(featureCalls).toBe(0)
	})

	it("elevates arc volcano above sea level from typical ocean depth with full stress", () => {
		const mesh = buildMesh()
		const elevation = new Float32Array(mesh.numRegions).fill(-0.3)
		const boundary = {
			mountain_r: new Set<number>(),
			coastline_r: new Set<number>(),
			ocean_r: new Set<number>(),
			r_stress: Float32Array.from({ length: mesh.numRegions }, (_, i) =>
				i === 0 ? 1 : 0,
			),
			r_subductFactor: new Float32Array(mesh.numRegions),
			r_boundaryType: Int8Array.from({ length: mesh.numRegions }, (_, i) =>
				i === 0 ? 1 : 0,
			),
			r_bothOcean: new Uint8Array(mesh.numRegions),
			r_hasOcean: Uint8Array.from({ length: mesh.numRegions }, (_, i) =>
				i === 0 ? 1 : 0,
			),
		}

		applyVolcanicArcs({
			mesh,
			elevation,
			boundary,
			maxStress: 1,
			seed: 7,
			volcanism: 1,
			markFeature: () => undefined,
		})

		expect(elevation[0]).toBeGreaterThan(0)
	})
})

describe("applyLargeIgneousProvinces", () => {
	it("spawns the legacy fixed seven-site LIP footprint at the baseline volcanism", () => {
		const lipSites = [] as Parameters<
			typeof applyLargeIgneousProvinces
		>[0]["lipSites"]
		appendLargeIgneousProvinceSites(lipSites, {
			x: 0,
			y: 0,
			z: 1,
			drift: [1, 0, 0],
			upwelling: 0.05,
			volcanism: 1,
			isOcean: false,
			random: (() => {
				const values = [0.2, 0.6, 0.5, 0.25, 0.4, 0.7, 0.3, 0.2, 0.8, 0.45]
				let index = 0
				return () => values[index++ % values.length]
			})(),
		})

		expect(lipSites).toHaveLength(7)
		expect(lipSites[0]?.height).toBeGreaterThan(0)
	})

	it("keeps oceanic LIPs but scales their uplift down", () => {
		const makeRandom = () => {
			const values = [0.2, 0.6, 0.5, 0.25, 0.4, 0.7, 0.3, 0.2, 0.8, 0.45]
			let index = 0
			return () => values[index++ % values.length]
		}
		const continentalSites = [] as Parameters<
			typeof applyLargeIgneousProvinces
		>[0]["lipSites"]
		const oceanicSites = [] as Parameters<
			typeof applyLargeIgneousProvinces
		>[0]["lipSites"]

		appendLargeIgneousProvinceSites(continentalSites, {
			x: 0,
			y: 0,
			z: 1,
			drift: [1, 0, 0],
			upwelling: 0.4,
			volcanism: 0.5,
			isOcean: false,
			random: makeRandom(),
		})
		appendLargeIgneousProvinceSites(oceanicSites, {
			x: 0,
			y: 0,
			z: 1,
			drift: [1, 0, 0],
			upwelling: 0.4,
			volcanism: 0.5,
			isOcean: true,
			random: makeRandom(),
		})

		expect(continentalSites).toHaveLength(7)
		expect(oceanicSites).toHaveLength(7)
		expect(oceanicSites[0]?.height).toBeCloseTo(
			(continentalSites[0]?.height ?? 0) * 0.6,
		)
	})

	it("keeps large igneous province site shapes identical across positive volcanism levels", () => {
		const makeRandom = () => {
			const values = [0.2, 0.6, 0.5, 0.25, 0.4, 0.7, 0.3, 0.2, 0.8, 0.45]
			let index = 0
			return () => values[index++ % values.length]
		}
		const baselineSites = [] as Parameters<
			typeof applyLargeIgneousProvinces
		>[0]["lipSites"]
		const extremeSites = [] as Parameters<
			typeof applyLargeIgneousProvinces
		>[0]["lipSites"]

		appendLargeIgneousProvinceSites(baselineSites, {
			x: 0,
			y: 0,
			z: 1,
			drift: [1, 0, 0],
			upwelling: 0.4,
			volcanism: 2,
			isOcean: false,
			random: makeRandom(),
		})
		appendLargeIgneousProvinceSites(extremeSites, {
			x: 0,
			y: 0,
			z: 1,
			drift: [1, 0, 0],
			upwelling: 0.4,
			volcanism: 10,
			isOcean: false,
			random: makeRandom(),
		})

		expect(extremeSites).toHaveLength(7)
		expect(extremeSites).toEqual(baselineSites)
	})

	it("adds uplift and marks large igneous province terrain features", () => {
		const mesh = buildMesh()
		const elevation = new Float32Array(mesh.numRegions)
		const tracker = createFeatureTracker(mesh.numRegions)
		const uplift = applyLargeIgneousProvinces({
			mesh,
			elevation,
			lipSites: [
				{
					x: mesh.r_xyz[0],
					y: mesh.r_xyz[1],
					z: mesh.r_xyz[2],
					height: 0.05,
					sigma: 0.08,
				},
			],
			seed: 11,
			markFeature: tracker.markFeature,
		})

		expect(uplift[0]).toBeGreaterThan(0)
		expect(elevation[0]).toBeCloseTo(uplift[0])
		expect(tracker.featureMask[0]).toBe(
			1 << (GENESIS_TERRAIN_FEATURE.LARGE_IGNEOUS_PROVINCE - 1),
		)
		expect(tracker.dominantFeature[0]).toBe(
			GENESIS_TERRAIN_FEATURE.LARGE_IGNEOUS_PROVINCE,
		)
	})

	it("returns zero uplift when no large igneous province sites are present", () => {
		const mesh = buildMesh()
		const elevation = new Float32Array(mesh.numRegions)
		let featureCalls = 0
		const uplift = applyLargeIgneousProvinces({
			mesh,
			elevation,
			lipSites: [],
			seed: 17,
			markFeature: () => {
				featureCalls++
			},
		})

		expect(Array.from(uplift)).toEqual(new Array(mesh.numRegions).fill(0))
		expect(Array.from(elevation)).toEqual(new Array(mesh.numRegions).fill(0))
		expect(featureCalls).toBe(0)
	})
})
