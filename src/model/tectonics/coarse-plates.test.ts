import { describe, expect, it } from "vitest"
import type { SphereMesh } from ".."
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import { generateCoarsePlates, projectCoarsePlates } from "./coarse-plates"

const SEED = 1234
const NUM_PLATES = 16
const TEST_COARSE_POINTS = 5000
const scenarioCache = new Map<string, ReturnType<typeof generateCoarsePlates>>()

function generate(
	overrides: {
		seed?: number
		numPlates?: number
		landDistribution?: number
		continentSizeVariety?: number
		landCoverage?: number
		coarsePoints?: number
	} = {},
) {
	const resolved = {
		seed: overrides.seed ?? SEED,
		numPlates: overrides.numPlates ?? NUM_PLATES,
		landDistribution: overrides.landDistribution ?? 0.25,
		continentSizeVariety: overrides.continentSizeVariety ?? 0.35,
		landCoverage: overrides.landCoverage ?? 0.3,
		coarsePoints: overrides.coarsePoints ?? TEST_COARSE_POINTS,
	}
	const key = JSON.stringify(resolved)
	const cached = scenarioCache.get(key)
	if (cached) return cached

	const result = generateCoarsePlates(
		resolved.seed,
		resolved.numPlates,
		resolved.landDistribution,
		resolved.continentSizeVariety,
		resolved.landCoverage,
		{ coarsePoints: resolved.coarsePoints },
	)
	scenarioCache.set(key, result)
	return result
}

describe("generateCoarsePlates", () => {
	it("returnsRequestedNumberOfPlateSeeds", () => {
		const result = generate()
		expect(result.coarsePlateSeeds.size).toBe(NUM_PLATES)
	})

	it("assignsEveryRegionToSomePlate", () => {
		const { coarseMesh, coarse_r_plate, coarsePlateSeeds } = generate()
		for (let r = 0; r < coarseMesh.numRegions; r++) {
			expect(coarsePlateSeeds.has(coarse_r_plate[r])).toBe(true)
		}
	})

	it("producesOneVectorPerPlate", () => {
		const { coarsePlateSeeds, coarsePlateVec } = generate()
		for (const seed of coarsePlateSeeds) {
			expect(coarsePlateVec.has(seed)).toBe(true)
		}
	})

	it("producesUnitLengthEulerPolePerPlate", () => {
		const { coarsePlateVec } = generate()
		for (const vec of coarsePlateVec.values()) {
			const [x, y, z] = vec.pole
			expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4)
		}
	})

	it("classifiesEveryPlateAsOceanWhenLandCoverageIsZero", () => {
		const { coarsePlateSeeds, coarsePlateIsOcean } = generate({
			landCoverage: 0,
		})
		expect(coarsePlateIsOcean.size).toBe(coarsePlateSeeds.size)
	})

	it("classifiesZeroPlatesAsOceanWhenLandCoverageIsOne", () => {
		const { coarsePlateIsOcean } = generate({ landCoverage: 1 })
		expect(coarsePlateIsOcean.size).toBe(0)
	})

	it("producesSamePlateAssignmentForSameSeed", () => {
		const a = generate({ seed: 99 })
		const b = generate({ seed: 99 })
		expect(a.coarse_r_plate).toEqual(b.coarse_r_plate)
	})

	it("producesDifferentPlateAssignmentForDifferentSeed", () => {
		const a = generate({ seed: 100 })
		const b = generate({ seed: 101 })
		let anyDiff = false
		for (let i = 0; i < a.coarse_r_plate.length; i++) {
			if (a.coarse_r_plate[i] !== b.coarse_r_plate[i]) {
				anyDiff = true
				break
			}
		}
		expect(anyDiff).toBe(true)
	})

	it("projects coarse assignments onto a higher resolution mesh deterministically", () => {
		const coarse = generate({ seed: 4321, coarsePoints: 750 })
		const highResMesh = buildSphereMesh(300, 0.75, createRng(9876))

		const first = projectCoarsePlates(
			highResMesh,
			coarse.coarseMesh,
			coarse.coarse_r_plate,
			4321,
			NUM_PLATES,
		)
		const second = projectCoarsePlates(
			highResMesh,
			coarse.coarseMesh,
			coarse.coarse_r_plate,
			4321,
			NUM_PLATES,
		)

		expect(first).toEqual(second)
		expect(first).toHaveLength(highResMesh.numRegions)
		for (const plate of first) {
			expect(coarse.coarsePlateSeeds.has(plate)).toBe(true)
		}
	})

	it("falls back to brute force projection when the coarse walk hits its step limit", () => {
		const coarseMesh = {
			numRegions: 1,
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(0),
			r_xyz: new Float32Array([1, 0, 0]),
		} as SphereMesh
		const highResMesh = {
			numRegions: 1,
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(0),
			r_xyz: new Float32Array([0, 1, 0]),
		} as SphereMesh

		expect(
			Array.from(
				projectCoarsePlates(
					highResMesh,
					coarseMesh,
					new Int32Array([7]),
					9,
					120,
				),
			),
		).toEqual([7])
	})
})
