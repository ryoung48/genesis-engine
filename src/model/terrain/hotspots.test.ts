import { describe, expect, it } from "vitest"
import type { TectonicPlate } from ".."
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import { projectMantleFieldToRegions } from "../tectonics/mantle"
import { OROGEN_TERRAIN_FEATURE } from "../types/tectonics"
import { applyHotspots, applyStaticHotspots } from "./hotspots"

function buildMesh() {
	return buildSphereMesh(1500, 0.5, createRng(1))
}

function buildPlate(isOcean: boolean): TectonicPlate[] {
	return [
		{
			id: 0,
			isOcean,
			pole: [0, 0, 1],
			omega: 1,
			regions: new Set<number>(),
			growthRate: 1,
			growthDir: [0, 0, 0],
			dirStrength: 0,
		},
	]
}

function buildTerrainFeatures(regionCount: number) {
	return {
		featureMask: new Uint32Array(regionCount),
		dominantFeature: new Uint8Array(regionCount),
		dominantMagnitude: new Float32Array(regionCount),
	}
}

function buildElevation(regionCount: number, value: number): Float32Array {
	const elevation = new Float32Array(regionCount)
	elevation.fill(value)
	return elevation
}

function weightedHotspotZ(
	mesh: ReturnType<typeof buildMesh>,
	hotspot: Float32Array,
) {
	let total = 0
	let weightedZ = 0
	for (let r = 0; r < hotspot.length; r++) {
		const weight = hotspot[r]
		total += weight
		weightedZ += weight * mesh.r_xyz[3 * r + 2]
	}
	return total > 0 ? weightedZ / total : 0
}

function totalHotspotUplift(hotspot: Float32Array): number {
	let total = 0
	for (let r = 0; r < hotspot.length; r++) total += hotspot[r]
	return total
}

function maxHotspotUplift(hotspot: Float32Array): number {
	let max = 0
	for (let r = 0; r < hotspot.length; r++) {
		if (hotspot[r] > max) max = hotspot[r]
	}
	return max
}

function hotspotFootprint(hotspot: Float32Array, threshold = 0.01): number {
	let footprint = 0
	for (let r = 0; r < hotspot.length; r++) {
		if (hotspot[r] > threshold) footprint++
	}
	return footprint
}

describe("applyHotspots", () => {
	it("biases hotspot placement toward mantle upwelling candidates", () => {
		const mesh = buildMesh()
		const plateAssignment = new Int32Array(mesh.numRegions)
		const mantleBias = new Float32Array(mesh.numRegions)
		for (let r = 0; r < mesh.numRegions; r++) {
			mantleBias[r] = mesh.r_xyz[3 * r + 2]
		}

		const biased = applyHotspots(
			mesh,
			buildPlate(false),
			plateAssignment,
			buildElevation(mesh.numRegions, 0.2),
			mantleBias,
			undefined,
			17,
			1,
		)
		const unbiased = applyHotspots(
			mesh,
			buildPlate(false),
			plateAssignment,
			buildElevation(mesh.numRegions, 0.2),
			new Float32Array(mesh.numRegions),
			undefined,
			17,
			1,
		)

		expect(weightedHotspotZ(mesh, biased)).toBeGreaterThan(
			weightedHotspotZ(mesh, unbiased) + 0.15,
		)
	})

	it("retains hotspot bias from spatial mantle projection within one plate", () => {
		const mesh = buildMesh()
		const coarseMesh = buildSphereMesh(300, 0.5, createRng(7))
		const plateAssignment = new Int32Array(mesh.numRegions)
		const coarseMantleField = new Float32Array(coarseMesh.numRegions)
		for (let r = 0; r < coarseMesh.numRegions; r++) {
			coarseMantleField[r] = coarseMesh.r_xyz[3 * r + 2]
		}

		const projectedMantle = projectMantleFieldToRegions(
			coarseMantleField,
			coarseMesh,
			mesh,
		)
		const spatiallyBiased = applyHotspots(
			mesh,
			buildPlate(false),
			plateAssignment,
			buildElevation(mesh.numRegions, 0.2),
			projectedMantle,
			undefined,
			17,
			1,
		)
		const flattened = applyHotspots(
			mesh,
			buildPlate(false),
			plateAssignment,
			buildElevation(mesh.numRegions, 0.2),
			new Float32Array(mesh.numRegions),
			undefined,
			17,
			1,
		)

		expect(weightedHotspotZ(mesh, spatiallyBiased)).toBeGreaterThan(
			weightedHotspotZ(mesh, flattened) + 0.15,
		)
	})

	it("spawns large igneous provinces for oceanic hotspot chains", () => {
		const mesh = buildMesh()
		const terrainFeatures = buildTerrainFeatures(mesh.numRegions)
		const hotspot = applyHotspots(
			mesh,
			buildPlate(true),
			new Int32Array(mesh.numRegions),
			buildElevation(mesh.numRegions, -0.2),
			new Float32Array(mesh.numRegions).fill(1),
			terrainFeatures,
			23,
			1,
		)

		const lipBit = 1 << (OROGEN_TERRAIN_FEATURE.LARGE_IGNEOUS_PROVINCE - 1)
		let markedLip = 0
		let activeHotspot = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if ((terrainFeatures.featureMask[r] & lipBit) !== 0) markedLip++
			if (hotspot[r] > 0) activeHotspot++
		}

		expect(markedLip).toBeGreaterThan(0)
		expect(activeHotspot).toBeGreaterThan(0)
	})

	it("gives continental hotspots a broader footprint than oceanic ones", () => {
		const mesh = buildMesh()
		const plateAssignment = new Int32Array(mesh.numRegions)
		const mantle = new Float32Array(mesh.numRegions).fill(1)
		const continental = applyHotspots(
			mesh,
			buildPlate(false),
			plateAssignment,
			buildElevation(mesh.numRegions, 0.2),
			mantle,
			buildTerrainFeatures(mesh.numRegions),
			31,
			1,
		)
		const oceanic = applyHotspots(
			mesh,
			buildPlate(true),
			plateAssignment,
			buildElevation(mesh.numRegions, -0.2),
			mantle,
			buildTerrainFeatures(mesh.numRegions),
			31,
			1,
		)

		let continentalFootprint = 0
		let oceanicFootprint = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if (continental[r] > 0.01) continentalFootprint++
			if (oceanic[r] > 0.01) oceanicFootprint++
		}

		expect(continentalFootprint).toBeGreaterThan(oceanicFootprint)
	})

	it("keeps active hotspot fields identical across volcanism levels", () => {
		const mesh = buildMesh()
		const plateAssignment = new Int32Array(mesh.numRegions)
		const mantle = new Float32Array(mesh.numRegions).fill(1)
		const baseline = applyHotspots(
			mesh,
			buildPlate(false),
			plateAssignment,
			buildElevation(mesh.numRegions, 0.2),
			mantle,
			buildTerrainFeatures(mesh.numRegions),
			41,
			2,
		)
		const overdriven = applyHotspots(
			mesh,
			buildPlate(false),
			plateAssignment,
			buildElevation(mesh.numRegions, 0.2),
			mantle,
			buildTerrainFeatures(mesh.numRegions),
			41,
			10,
		)

		expect(overdriven).toEqual(baseline)
		expect(totalHotspotUplift(overdriven)).toBeCloseTo(
			totalHotspotUplift(baseline),
		)
		expect(hotspotFootprint(overdriven)).toBe(hotspotFootprint(baseline))
		expect(maxHotspotUplift(overdriven)).toBeCloseTo(maxHotspotUplift(baseline))
	})

	it("is deterministic for repeated active-hotspot runs with the same inputs", () => {
		const mesh = buildMesh()
		const plateAssignment = new Int32Array(mesh.numRegions)
		const mantle = new Float32Array(mesh.numRegions).fill(1)
		const elevation = buildElevation(mesh.numRegions, 0.2)
		const featuresA = buildTerrainFeatures(mesh.numRegions)
		const featuresB = buildTerrainFeatures(mesh.numRegions)

		const first = applyHotspots(
			mesh,
			buildPlate(false),
			plateAssignment,
			elevation.slice(),
			mantle,
			featuresA,
			59,
			5,
		)
		const second = applyHotspots(
			mesh,
			buildPlate(false),
			plateAssignment,
			elevation.slice(),
			mantle,
			featuresB,
			59,
			5,
		)

		expect(second).toEqual(first)
		expect(featuresB.featureMask).toEqual(featuresA.featureMask)
		expect(featuresB.dominantFeature).toEqual(featuresA.dominantFeature)
	})
})

describe("applyStaticHotspots", () => {
	it("is deterministic and boosts total uplift over oceanic crust", () => {
		const mesh = buildMesh()
		const oceanic = applyStaticHotspots(
			mesh,
			buildElevation(mesh.numRegions, -0.2),
			19,
			4,
		)
		const oceanicRepeat = applyStaticHotspots(
			mesh,
			buildElevation(mesh.numRegions, -0.2),
			19,
			4,
		)
		const continental = applyStaticHotspots(
			mesh,
			buildElevation(mesh.numRegions, 0.2),
			19,
			4,
		)

		expect(oceanicRepeat).toEqual(oceanic)
		expect(totalHotspotUplift(oceanic)).toBeGreaterThan(
			totalHotspotUplift(continental),
		)
	})

	it("widens the static hotspot footprint as volcanism increases", () => {
		const mesh = buildMesh()
		const lowVolcanism = applyStaticHotspots(
			mesh,
			buildElevation(mesh.numRegions, 0.2),
			29,
			1,
		)
		const highVolcanism = applyStaticHotspots(
			mesh,
			buildElevation(mesh.numRegions, 0.2),
			29,
			10,
		)

		expect(totalHotspotUplift(highVolcanism)).toBeGreaterThan(
			totalHotspotUplift(lowVolcanism),
		)
		expect(hotspotFootprint(highVolcanism)).toBeGreaterThan(
			hotspotFootprint(lowVolcanism),
		)
	})
})
