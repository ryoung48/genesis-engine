import { describe, expect, it } from "vitest"
import { ENDORHEIC } from "@/model/geography/terrain/endorheic"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG

describe("basin water balance", () => {
	const cells = [0, 1, 2]
	const basin = {
		cells,
		deficitMm: Float32Array.of(1000, 1000, 1000),
		areaM2: Float64Array.of(2, 2, 2),
		secondsPerYear: 1,
	}
	const evaporation = (3 * (2 * 1000)) / 1000

	it("is open above full evaporation, terminal below it and open at equality", () => {
		expect(
			ENDORHEIC.verdict({ ...basin, inflowM3s: evaporation * 1.01 }).terminal,
		).toBe(false)
		expect(
			ENDORHEIC.verdict({ ...basin, inflowM3s: evaporation * 0.99 }).terminal,
		).toBe(true)
		expect(
			ENDORHEIC.verdict({ ...basin, inflowM3s: evaporation }).terminal,
		).toBe(false)
		expect(ENDORHEIC.verdict({ ...basin, inflowM3s: 0 }).evaporationM3s).toBe(
			evaporation,
		)
	})

	it("evaporation uses lakeEvapShare * PET - rain clamped at zero per region", () => {
		const N = 3
		const pet = new Float32Array(12 * N)
		for (let m = 0; m < 12; m++) {
			pet[m * N] = 100
			pet[m * N + 1] = 100
			pet[m * N + 2] = 10
		}
		const deficit = ENDORHEIC.evaporationDeficit({
			petMonthly: pet,
			rainfallAnnual: Float32Array.of(0, 1200, 500),
			numRegions: N,
		})
		expect(deficit[0]).toBeCloseTo(C.lakeEvapShare * 1200, 3)
		expect(deficit[1]).toBeCloseTo(
			Math.max(0, C.lakeEvapShare * 1200 - 1200),
			3,
		)
		expect(deficit[2]).toBe(0)
	})

	it("layout finds each basin's cells and lowest region", () => {
		const layout = ENDORHEIC.layout({
			basinId: Int32Array.of(-1, 0, 0, 1, 1, 1),
			elevation: Float32Array.of(9, 3, 2, 5, 4, 6),
		})
		expect(layout.cells).toEqual([
			[1, 2],
			[3, 4, 5],
		])
		expect(Array.from(layout.lowest)).toEqual([2, 4])
	})

	it("outlets are the basin cells that drain outside the basin", () => {
		const out = ENDORHEIC.outlets({
			basinId: Int32Array.of(0, 0, 0, -1),
			drainTarget: Int32Array.of(1, 2, 3, -1),
			basinCount: 1,
		})
		expect(out).toEqual([[2]])
	})
})
