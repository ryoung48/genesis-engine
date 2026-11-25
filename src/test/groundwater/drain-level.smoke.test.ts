import { describe, expect, it } from "vitest"
import { DRAIN_LEVEL } from "@/model/geography/terrain/groundwater/drain-level"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG

function chain({
	heights,
	wet,
	pan,
	water,
	waterLevel,
}: {
	heights: number[]
	wet: number[]
	pan?: number[]
	water?: number[]
	waterLevel?: number[]
}) {
	const n = heights.length
	const drainTarget = Int32Array.from({ length: n }, (_, i) => i - 1)
	const processOrder = Int32Array.from(
		Array.from({ length: n }, (_, i) => i).filter((i) => !water?.[i]),
	)
	return DRAIN_LEVEL.compute({
		drainTarget,
		processOrder,
		heightM: Float32Array.from(heights),
		reliefM: Float32Array.from({ length: n }, () => 40),
		waterLevelM: Float32Array.from(waterLevel ?? new Array(n).fill(0)),
		water: Uint8Array.from(water ?? new Array(n).fill(0)),
		pan: Uint8Array.from(pan ?? new Array(n).fill(0)),
		wet: Uint8Array.from(wet),
	})
}

describe("drain level", () => {
	it("incision follows the clamped relief formula", () => {
		expect(DRAIN_LEVEL.incision({ reliefM: 0 })).toBe(C.incisionMinM)
		expect(DRAIN_LEVEL.incision({ reliefM: 40 })).toBeCloseTo(
			C.incisionMinM + C.incisionRel * 40,
			9,
		)
		expect(DRAIN_LEVEL.incision({ reliefM: 1e6 })).toBe(C.incisionMaxM)
	})

	it("wet regions sit at height minus incision", () => {
		const result = chain({ heights: [0, 100, 200], wet: [1, 1, 1] })
		for (let r = 1; r < 3; r++) {
			expect(result.headM[r]).toBeCloseTo(
				[0, 100, 200][r] - result.incisionM[r],
				4,
			)
			expect(result.offsetM[r]).toBe(0)
		}
	})

	it("a dry region is at or below its downstream neighbour and has a non-negative offset", () => {
		const result = chain({ heights: [0, 100, 300, 320], wet: [1, 0, 0, 0] })
		for (let r = 1; r < 4; r++) {
			expect(result.headM[r]).toBeLessThanOrEqual(result.headM[r - 1] + 1e-4)
			expect(result.offsetM[r]).toBeGreaterThanOrEqual(0)
		}
		expect(result.offsetM[2]).toBeGreaterThan(0)
	})

	it("a region draining to the sea ends at its local drain level", () => {
		const result = chain({ heights: [0, 100], wet: [0, 0] })
		expect(result.headM[0]).toBeCloseTo(0 - result.incisionM[0], 4)
	})

	it("a pan sits panDepthM below its surface and regions draining to it end there", () => {
		const result = chain({
			heights: [10, 200],
			wet: [0, 0],
			pan: [1, 0],
		})
		expect(result.headM[0]).toBeCloseTo(10 - C.panDepthM, 5)
		expect(result.headM[1]).toBeLessThanOrEqual(result.headM[0] + 1e-4)
	})

	it("water regions carry their water level", () => {
		const result = chain({
			heights: [5, 50],
			wet: [0, 0],
			water: [1, 0],
			waterLevel: [7, 0],
		})
		expect(result.headM[0]).toBe(7)
		expect(result.headM[1]).toBeLessThanOrEqual(7)
	})
})
