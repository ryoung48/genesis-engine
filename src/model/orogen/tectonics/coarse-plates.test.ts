import { describe, expect, it } from "vitest"
import { generateCoarsePlates } from "./coarse-plates"

const SEED = 1234
const NUM_PLATES = 16

function generate(
	overrides: {
		seed?: number
		numPlates?: number
		landDistribution?: number
		continentSizeVariety?: number
		landCoverage?: number
	} = {},
) {
	return generateCoarsePlates(
		overrides.seed ?? SEED,
		overrides.numPlates ?? NUM_PLATES,
		overrides.landDistribution ?? 0.25,
		overrides.continentSizeVariety ?? 0.35,
		overrides.landCoverage ?? 0.3,
	)
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
})
