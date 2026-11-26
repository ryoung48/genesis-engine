import { describe, expect, it } from "vitest"
import { COMMODITIES } from "@/model/geography/terrain/deposits/commodities"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"
import { PROVINCE_DEPOSITS } from "@/model/society/province-deposits"

const REGIONS = 6
const BYTE = 255

function fixture() {
	const rows = new Uint8Array(SYSTEMS.count * REGIONS)
	const set = (
		system: keyof typeof SYSTEMS.index,
		region: number,
		v: number,
	) => {
		rows[SYSTEMS.index[system] * REGIONS + region] = Math.round(v * BYTE)
	}
	set("tin", 0, 0.8)
	set("tin", 1, 0.2)
	set("placerTin", 1, 0.5)
	set("bogIron", 2, 0.6)
	set("coal", 3, 0.5)
	set("coal", 4, 0.1)
	const mesh = {
		numRegions: REGIONS,
		regionArea: Float32Array.from([1, 3, 2, 2, 5, 1]),
	}
	const provinces = {
		count: 3,
		regionProvince: Int32Array.from([0, 0, 1, 2, 2, -1]),
	}
	return { rows, mesh, provinces }
}

function richnessAt(rows: Uint8Array, region: number, id: string): number {
	return COMMODITIES.richness({
		rows,
		numRegions: REGIONS,
		region,
		commodity: COMMODITIES.index[id as keyof typeof COMMODITIES.index],
	})
}

describe("province deposits", () => {
	const { rows, mesh, provinces } = fixture()
	const result = PROVINCE_DEPOSITS.aggregate({ provinces, mesh, rows })
	const width = COMMODITIES.count

	it("takes the area-weighted mean of region richness", () => {
		const tin = COMMODITIES.index.tin
		const expected =
			(1 * richnessAt(rows, 0, "tin") + 3 * richnessAt(rows, 1, "tin")) / 4
		expect(result.richness[0 * width + tin]).toBeCloseTo(expected, 6)
	})

	it("gives a one-region province that region's richness", () => {
		const iron = COMMODITIES.index.iron
		expect(result.richness[1 * width + iron]).toBeCloseTo(
			richnessAt(rows, 2, "iron"),
			6,
		)
	})

	it("counts the area at moderate richness or better", () => {
		const coal = COMMODITIES.index.coal
		expect(result.rich[2 * width + coal]).toBeCloseTo(2 / (2 + 5), 6)
		expect(result.rich[0 * width + COMMODITIES.index.tin]).toBeCloseTo(1, 6)
		expect(result.rich[2 * width + COMMODITIES.index.iron]).toBe(0)
	})

	it("ignores regions outside any province", () => {
		const total = result.richness.reduce((sum, v) => sum + v, 0)
		expect(Number.isFinite(total)).toBe(true)
	})
})
