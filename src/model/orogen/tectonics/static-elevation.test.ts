import { describe, expect, it } from "vitest"
import { buildSphereMesh } from "../mesh"
import { createRng } from "../util/rng"
import { generateStaticElevation } from "./static-elevation"

function buildMesh(n = 500, seed = 1) {
	return buildSphereMesh(n, 0.5, createRng(seed))
}

describe("generateStaticElevation", () => {
	const SEED = 42
	const ROUGHNESS = 0.4

	function buildOceanMask(
		numRegions: number,
		oceanFraction = 0.55,
	): Uint8Array {
		const mask = new Uint8Array(numRegions)
		for (let r = 0; r < numRegions; r++) {
			mask[r] = r < Math.floor(numRegions * oceanFraction) ? 1 : 0
		}
		return mask
	}

	it("producesElevationArrayLengthOfNumRegions", () => {
		const mesh = buildMesh(500, 1)
		const plateOceanMask = buildOceanMask(mesh.numRegions)
		const elevation = generateStaticElevation(
			mesh,
			SEED,
			ROUGHNESS,
			0.45,
			0.5,
			plateOceanMask,
		)
		expect(elevation.length).toBe(mesh.numRegions)
	})

	it("producesFiniteElevationForEveryRegion", () => {
		const mesh = buildMesh(500, 1)
		const plateOceanMask = buildOceanMask(mesh.numRegions)
		const elevation = generateStaticElevation(
			mesh,
			SEED,
			ROUGHNESS,
			0.45,
			0.5,
			plateOceanMask,
		)
		for (let r = 0; r < elevation.length; r++) {
			expect(Number.isFinite(elevation[r])).toBe(true)
		}
	})

	it("producesPositiveTendencyForLandCells", () => {
		const mesh = buildMesh(500, 2)
		const N = mesh.numRegions
		// Make the second half land cells
		const plateOceanMask = new Uint8Array(N)
		for (let r = 0; r < N; r++) plateOceanMask[r] = r < N / 2 ? 1 : 0
		const elevation = generateStaticElevation(
			mesh,
			SEED,
			ROUGHNESS,
			0.45,
			0.5,
			plateOceanMask,
		)
		let landSum = 0
		let oceanSum = 0
		for (let r = 0; r < N; r++) {
			if (plateOceanMask[r]) oceanSum += elevation[r]
			else landSum += elevation[r]
		}
		// Land bias should produce positive average, ocean negative
		expect(landSum / (N / 2)).toBeGreaterThan(oceanSum / (N / 2))
	})

	it("producesDeterministicOutputForSameSeed", () => {
		const mesh = buildMesh(300, 3)
		const plateOceanMask = buildOceanMask(mesh.numRegions)
		const a = generateStaticElevation(
			mesh,
			SEED,
			ROUGHNESS,
			0.45,
			0.5,
			plateOceanMask,
		)
		const b = generateStaticElevation(
			mesh,
			SEED,
			ROUGHNESS,
			0.45,
			0.5,
			plateOceanMask,
		)
		expect(a).toEqual(b)
	})

	it("producesDifferentOutputForDifferentSeeds", () => {
		const mesh = buildMesh(300, 3)
		const plateOceanMask = buildOceanMask(mesh.numRegions)
		const a = generateStaticElevation(
			mesh,
			100,
			ROUGHNESS,
			0.45,
			0.5,
			plateOceanMask,
		)
		const b = generateStaticElevation(
			mesh,
			200,
			ROUGHNESS,
			0.45,
			0.5,
			plateOceanMask,
		)
		let anyDiff = false
		for (let r = 0; r < a.length; r++) {
			if (a[r] !== b[r]) {
				anyDiff = true
				break
			}
		}
		expect(anyDiff).toBe(true)
	})
})
