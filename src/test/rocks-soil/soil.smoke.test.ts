import { describe, expect, it } from "vitest"
import { ROCKS } from "@/model/geography/terrain/rocks"
import type { RockKind, YoungKind } from "@/model/geography/terrain/rocks/types"
import { SOILS } from "@/model/geography/terrain/soils"
import type { SoilClimate } from "@/model/geography/terrain/soils/types"

const NEUTRAL: SoilClimate = { wet: 0.8, mean: 10, warmest: 18, coldest: 2 }
const STEPPE: SoilClimate = { wet: 0.7, mean: 8, warmest: 24, coldest: -4 }
const TROPICAL: SoilClimate = { wet: 2, mean: 26, warmest: 28, coldest: 24 }
const TAIGA: SoilClimate = { wet: 1, mean: 0, warmest: 16, coldest: -20 }

function fertility({
	rock,
	young = "none",
	rising = 0,
	forested = true,
	climate = NEUTRAL,
}: {
	rock: RockKind
	young?: YoungKind
	rising?: number
	forested?: boolean
	climate?: SoilClimate
}): number {
	return SOILS.soilAt({ rock, young, rising, forested, climate }).fertility
}

describe("soil", () => {
	it("keeps fertility within 0..1 for every rock and young tag under every climate", () => {
		for (const climate of [NEUTRAL, STEPPE, TROPICAL, TAIGA])
			for (const rock of ROCKS.kinds.filter((k) => k !== "sea"))
				for (const young of ROCKS.youngKinds) {
					const value = fertility({ rock, young, climate })
					expect(value).toBeGreaterThanOrEqual(0)
					expect(value).toBeLessThanOrEqual(1)
				}
	})

	it("ranks parent material the way the table does", () => {
		expect(fertility({ rock: "young", young: "river" })).toBeGreaterThan(
			fertility({ rock: "limestone" }),
		)
		expect(fertility({ rock: "limestone" })).toBeGreaterThan(
			fertility({ rock: "sandstone" }),
		)
		expect(fertility({ rock: "sandstone" })).toBeGreaterThan(
			fertility({ rock: "ophiolite" }),
		)
		expect(fertility({ rock: "salt" })).toBeLessThan(0.1)
	})

	it("leaches old rock in the wet tropics but spares fresh river and volcanic parent", () => {
		const loss = (rock: RockKind, young: YoungKind = "none") =>
			fertility({ rock, young, climate: NEUTRAL }) -
			fertility({ rock, young, climate: TROPICAL })
		expect(loss("shale")).toBeGreaterThan(0)
		expect(loss("young", "river")).toBeLessThan(loss("shale"))
		expect(loss("volcanic")).toBeLessThan(loss("shale"))
	})

	it("spares leaching on rising ranges in proportion to their activity", () => {
		const at = (rising: number) =>
			fertility({ rock: "shale", rising, climate: TROPICAL })
		expect(at(1)).toBeGreaterThan(at(0.5))
		expect(at(0.5)).toBeGreaterThan(at(0))
		expect(
			fertility({ rock: "shale", rising: 1, climate: NEUTRAL }),
		).toBeCloseTo(fertility({ rock: "shale", climate: NEUTRAL }), 2)
	})

	it("gives sand seas the poorest young parent and words for every kind", () => {
		expect(fertility({ rock: "young", young: "erg" })).toBeLessThan(
			fertility({ rock: "sandstone" }),
		)
		expect(SOILS.kindWord({ rock: "young", young: "erg" })).toBe("dune sand")
		expect(SOILS.kindWord({ rock: "young", young: "none" })).toBe("river silt")
		expect(SOILS.kindWord({ rock: "gneiss", young: "none" })).toBe(
			"thin granite soil",
		)
		expect(SOILS.modifierWord("black")).toBe("black earth")
		for (const rock of ROCKS.kinds.filter((k) => k !== "sea"))
			expect(SOILS.kindWord({ rock, young: "none" }).length).toBeGreaterThan(0)
	})

	it("builds black earth on warm summers, cold winters and moderate rain", () => {
		const soil = SOILS.soilAt({
			rock: "young",
			young: "loess",
			rising: 0,
			forested: false,
			climate: STEPPE,
		})
		expect(soil.modifier).toBe("black")
		expect(soil.fertility).toBeGreaterThan(soil.parent)
	})

	it("podzolizes cold forest ground but not cold ground without woods", () => {
		const modifier = (forested: boolean) =>
			SOILS.soilAt({
				rock: "granite",
				young: "none",
				rising: 0,
				forested,
				climate: TAIGA,
			}).modifier
		expect(modifier(true)).toBe("podzol")
		expect(modifier(false)).toBe("none")
		expect(fertility({ rock: "granite", climate: TAIGA })).toBeLessThan(
			fertility({ rock: "granite", climate: NEUTRAL }),
		)
		expect(
			fertility({ rock: "granite", forested: false, climate: TAIGA }),
		).toBeGreaterThan(fertility({ rock: "granite", climate: TAIGA }))
	})

	it("names a grade for every fertility, rising with it", () => {
		expect([0, 0.2, 0.4, 0.6, 0.9].map((v) => SOILS.grade(v))).toEqual([
			"Barren",
			"Poor",
			"Middling",
			"Good",
			"Rich",
		])
	})
})
