import { describe, expect, it } from "vitest"
import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import { KARST } from "@/model/geography/terrain/karst"
import { ROCKS } from "@/model/geography/terrain/rocks"

const WET = { rain: 1400, mean: 15 }
const DRY = { rain: 0, mean: 15 }

interface Row {
	rock: number
	bedrock: number
	rain?: number
	mean?: number
	land?: number
	iced?: number
	spring?: number
}

function run(rows: Row[]) {
	const n = rows.length
	return KARST.classify({
		numRegions: n,
		isLand: Uint8Array.from(rows, (row) => row.land ?? 1),
		iced: Uint8Array.from(rows, (row) => row.iced ?? 0),
		rock: Uint8Array.from(rows, (row) => row.rock),
		bedrock: Uint8Array.from(rows, (row) => row.bedrock),
		rain: Float32Array.from(rows, (row) => row.rain ?? WET.rain),
		mean: Float32Array.from(rows, (row) => row.mean ?? WET.mean),
		spring: Uint8Array.from(rows, (row) => row.spring ?? 0),
	})
}

const code = ROCKS.code

describe("karst kind", () => {
	it("follows the rock and the bedrock under young sediment", () => {
		const result = run([
			{ rock: code.limestone, bedrock: code.limestone },
			{ rock: code.young, bedrock: code.limestone },
			{ rock: code.salt, bedrock: code.salt },
			{ rock: code.young, bedrock: code.salt },
			{ rock: code.sandstone, bedrock: code.sandstone },
			{ rock: code.young, bedrock: code.sandstone },
			{ rock: code.young, bedrock: code.young },
			{ rock: code.basalt, bedrock: code.basalt },
		])
		const kinds = Array.from(result.kind, (k) => KARST.kinds[k])
		expect(kinds).toEqual([
			"carbonate",
			"coveredCarbonate",
			"evaporite",
			"evaporite",
			"none",
			"none",
			"none",
			"none",
		])
	})

	it("gives ice land and non-land regions no karst", () => {
		const result = run([
			{ rock: code.limestone, bedrock: code.limestone, iced: 1 },
			{ rock: code.limestone, bedrock: code.limestone, land: 0 },
		])
		expect(Array.from(result.kind)).toEqual([0, 0])
		expect(Array.from(result.potential)).toEqual([0, 0])
		expect(Array.from(result.activity)).toEqual([0, 0])
	})
})

describe("karst potential", () => {
	it("is 0.15 + 0.85 times the water term on exposed carbonate and half that when covered", () => {
		const result = run([
			{ rock: code.limestone, bedrock: code.limestone, ...WET },
			{ rock: code.young, bedrock: code.limestone, ...WET },
			{ rock: code.limestone, bedrock: code.limestone, ...DRY },
			{ rock: code.young, bedrock: code.limestone, ...DRY },
		])
		expect(result.potential[0]).toBeCloseTo(1, 6)
		expect(result.potential[1]).toBeCloseTo(0.5, 6)
		expect(result.potential[2]).toBeCloseTo(0.15, 6)
		expect(result.potential[3]).toBeCloseTo(0.075, 6)
		for (let i = 0; i < 4; i++)
			expect(result.potential[i]).toBeCloseTo(
				(i % 2 === 1 ? 0.5 : 1) * (0.15 + 0.85 * result.water[i]),
				6,
			)
	})

	it("follows the rain ramp on evaporite", () => {
		const result = run([
			{ rock: code.salt, bedrock: code.salt, rain: 300 },
			{ rock: code.salt, bedrock: code.salt, rain: 0 },
			{ rock: code.salt, bedrock: code.salt, rain: 175 },
		])
		expect(result.water[0]).toBeCloseTo(1, 6)
		expect(result.water[1]).toBe(0)
		expect(result.water[2]).toBeCloseTo(0.5, 6)
		expect(result.potential[1]).toBeCloseTo(0.15, 6)
	})
})

describe("karst water term", () => {
	it("is 0 at the dry edge, 1 at the wet edge and 0 when cold", () => {
		const result = run([
			{ rock: code.limestone, bedrock: code.limestone, rain: 250 },
			{ rock: code.limestone, bedrock: code.limestone, rain: 1000 },
			{ rock: code.limestone, bedrock: code.limestone, rain: 1400, mean: -5 },
		])
		expect(result.water[0]).toBe(0)
		expect(result.water[1]).toBeCloseTo(1, 6)
		expect(result.water[2]).toBe(0)
	})

	it("lets dry exposed carbonate fall below the cave edge", () => {
		const result = run([
			{ rock: code.limestone, bedrock: code.limestone, rain: 250 },
		])
		expect(result.potential[0]).toBeLessThan(0.2)
	})
})

describe("karst activity", () => {
	it("is active at or above the active water level of the water term, relict below, spring at a karst spring", () => {
		const limestone = { rock: code.limestone, bedrock: code.limestone }
		const result = run([
			{ ...limestone, rain: 700 },
			{ ...limestone, rain: 550 },
			{ ...limestone, rain: 550, spring: SPRINGS.code.karst },
			{ ...limestone, rain: 700, spring: SPRINGS.code.seepage },
		])
		const names = Array.from(result.activity, (a) => KARST.activities[a])
		expect(names).toEqual(["active", "relict", "spring", "active"])
		expect(result.water[0]).toBeGreaterThanOrEqual(0.5)
		expect(result.water[1]).toBeLessThan(0.5)
	})
})
