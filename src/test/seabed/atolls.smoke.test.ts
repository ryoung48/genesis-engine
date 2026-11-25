import { describe, expect, it } from "vitest"
import { CRUST } from "@/model/geography/tectonics/crust"
import { SEABED_ATOLLS } from "@/model/geography/terrain/seabed/atolls"
import type { AtollCrust } from "@/model/geography/terrain/seabed/atolls/types"
import { lineMesh } from "@/test/shore/line-mesh"

const REGIONS = 6

interface Cell {
	volcType: number
	type: number
	volcKm: number
	volcWornKm: number
}

const BASE: Cell = {
	volcType: CRUST.VOLCANIC.TRACK,
	type: CRUST.TYPE.OCEAN,
	volcKm: 3,
	volcWornKm: 2.8,
}

function crustOf(cells: Cell[]): AtollCrust {
	return {
		numCells: cells.length,
		volcType: Uint8Array.from(cells.map((cell) => cell.volcType)),
		type: Uint8Array.from(cells.map((cell) => cell.type)),
		volcKm: Float32Array.from(cells.map((cell) => cell.volcKm)),
		volcWornKm: Float32Array.from(cells.map((cell) => cell.volcWornKm)),
	}
}

function sitesFor({
	cells,
	regions,
	coldC = 24,
	land = [],
}: {
	cells: Array<Partial<Cell>>
	regions: number[]
	coldC?: number
	land?: number[]
}) {
	const isLand = new Uint8Array(REGIONS)
	for (const r of land) isLand[r] = 1
	return SEABED_ATOLLS.sites({
		mesh: lineMesh(REGIONS),
		crust: crustOf(cells.map((cell) => ({ ...BASE, ...cell }))),
		sample: { regionOfCell: Int32Array.from(regions) },
		isLand,
		openWater: Uint8Array.from(isLand, (v) => 1 - v),
		temperatureMonthly: new Float32Array(12 * REGIONS).fill(coldC),
	})
}

describe("seabed atoll sites", () => {
	it("a worn warm track cell is a site with its age and peak", () => {
		const sites = sitesFor({ cells: [{}], regions: [3] })
		expect(Array.from(sites.region)).toEqual([3])
		expect(sites.ageMyr[0]).toBeCloseTo(2.8 / 0.15, 3)
		expect(sites.peakKm[0]).toBeCloseTo(3, 5)
		expect(sites.xyz.length).toBe(3)
	})

	it("a standing volcano is not a site", () => {
		expect(
			sitesFor({ cells: [{ volcWornKm: 1 }], regions: [3] }).region.length,
		).toBe(0)
	})

	it("a volcano that was never a seamount is not a site", () => {
		expect(
			sitesFor({ cells: [{ volcKm: 0.9, volcWornKm: 0.8 }], regions: [3] })
				.region.length,
		).toBe(0)
	})

	it("cold water makes a drowned seamount, not an atoll", () => {
		expect(
			sitesFor({ cells: [{}], regions: [3], coldC: 17 }).region.length,
		).toBe(0)
	})

	it("only oceanic hotspot-track cells count", () => {
		expect(
			sitesFor({ cells: [{ volcType: CRUST.VOLCANIC.LIP }], regions: [3] })
				.region.length,
		).toBe(0)
		expect(
			sitesFor({ cells: [{ type: CRUST.TYPE.CONTINENT }], regions: [3] }).region
				.length,
		).toBe(0)
	})

	it("a site on land is dropped", () => {
		expect(
			sitesFor({ cells: [{}], regions: [3], land: [3] }).region.length,
		).toBe(0)
	})

	it("two cells in one region merge to the oldest", () => {
		const sites = sitesFor({
			cells: [
				{ volcKm: 2, volcWornKm: 1.7 },
				{ volcKm: 3, volcWornKm: 2.9 },
			],
			regions: [2, 2],
		})
		expect(sites.region.length).toBe(1)
		expect(sites.peakKm[0]).toBeCloseTo(3, 5)
	})

	it("sites are ordered by region", () => {
		const sites = sitesFor({ cells: [{}, {}], regions: [5, 1] })
		expect(Array.from(sites.region)).toEqual([1, 5])
	})
})
