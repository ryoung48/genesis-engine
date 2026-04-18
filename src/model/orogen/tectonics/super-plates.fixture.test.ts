import { describe, expect, it } from "vitest"
import { generateCoarsePlates } from "./coarse-plates"
import { buildSuperPlates } from "./super-plates"

const SEED = 12345
const NUM_PLATES = 12

function buildTestData() {
	const coarse = generateCoarsePlates(SEED, NUM_PLATES, 0.25, 0.35, 0.45)
	const plateSeeds = [...coarse.coarsePlateSeeds]
	const plateDensity = new Map(
		plateSeeds.map((pid) => [
			pid,
			coarse.coarsePlateIsOcean.has(pid) ? 3.0 : 2.7,
		]),
	)
	return { coarse, plateSeeds, plateDensity }
}

describe("buildSuperPlates", () => {
	it("returnsPositiveSuperPlateCount", () => {
		const { coarse, plateSeeds, plateDensity } = buildTestData()
		const result = buildSuperPlates(
			coarse.coarseMesh,
			coarse.coarse_r_plate,
			plateSeeds,
			coarse.coarsePlateVec,
			coarse.coarsePlateIsOcean,
			plateDensity,
		)
		expect(result.numSuperPlates).toBeGreaterThan(0)
	})

	it("producesFewSuperPlatesThanPlates", () => {
		const { coarse, plateSeeds, plateDensity } = buildTestData()
		const result = buildSuperPlates(
			coarse.coarseMesh,
			coarse.coarse_r_plate,
			plateSeeds,
			coarse.coarsePlateVec,
			coarse.coarsePlateIsOcean,
			plateDensity,
		)
		expect(result.numSuperPlates).toBeLessThanOrEqual(plateSeeds.length)
	})

	it("assignsEveryCellToASuperPlate", () => {
		const { coarse, plateSeeds, plateDensity } = buildTestData()
		const result = buildSuperPlates(
			coarse.coarseMesh,
			coarse.coarse_r_plate,
			plateSeeds,
			coarse.coarsePlateVec,
			coarse.coarsePlateIsOcean,
			plateDensity,
		)
		const { r_superPlate } = result
		for (let r = 0; r < r_superPlate.length; r++) {
			expect(r_superPlate[r]).toBeGreaterThanOrEqual(0)
			expect(r_superPlate[r]).toBeLessThan(result.numSuperPlates)
		}
	})

	it("assignsEachPlateToExactlyOneSuperPlate", () => {
		const { coarse, plateSeeds, plateDensity } = buildTestData()
		const result = buildSuperPlates(
			coarse.coarseMesh,
			coarse.coarse_r_plate,
			plateSeeds,
			coarse.coarsePlateVec,
			coarse.coarsePlateIsOcean,
			plateDensity,
		)
		// For each plate seed, all regions with that plate id should map to the same super plate
		const plateToSuperPlate = new Map<number, number>()
		for (let r = 0; r < coarse.coarseMesh.numRegions; r++) {
			const pid = coarse.coarse_r_plate[r]
			const sp = result.r_superPlate[r]
			const existing = plateToSuperPlate.get(pid)
			if (existing === undefined) {
				plateToSuperPlate.set(pid, sp)
			} else {
				expect(sp).toBe(existing)
			}
		}
	})

	it("producesSuperPlateVecForEachSuperPlate", () => {
		const { coarse, plateSeeds, plateDensity } = buildTestData()
		const result = buildSuperPlates(
			coarse.coarseMesh,
			coarse.coarse_r_plate,
			plateSeeds,
			coarse.coarsePlateVec,
			coarse.coarsePlateIsOcean,
			plateDensity,
		)
		expect(result.superPlateVec.size).toBe(result.numSuperPlates)
	})
})
