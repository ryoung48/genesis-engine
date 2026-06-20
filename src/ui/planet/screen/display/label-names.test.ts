import { describe, expect, it } from "vitest"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import {
	buildNationDynastyLabelNames,
	buildNationLabelNames,
	buildSettlementLabelNames,
} from "./label-names"

describe("label-names", () => {
	it("builds nation label names from nation capital provinces", () => {
		const world = {
			nations: {
				seeds: new Int32Array([4, 1]),
			},
		} as unknown as SerializedGenesisWorld

		expect(
			buildNationLabelNames(world, {
				nation: (capitalProvince) => `Nation at ${capitalProvince}`,
				dynasty: (dynastyId) => `Dynasty ${dynastyId}`,
				province: (provinceIdx) => `Province ${provinceIdx}`,
				culture: (cultureIdx) => `Culture ${cultureIdx}`,
				heritage: (heritageIdx) => `Heritage ${heritageIdx}`,
			}),
		).toEqual(["Nation at 4", "Nation at 1"])
	})

	it("builds dynasty label names from each nation capital dynasty", () => {
		const world = {
			nations: {
				seeds: new Int32Array([0, 2, 3]),
			},
			leaderDynasty: new Int32Array([7, -1, 4, -1]),
		} as unknown as SerializedGenesisWorld

		expect(
			buildNationDynastyLabelNames(world, {
				nation: (capitalProvince) => `Nation at ${capitalProvince}`,
				dynasty: (dynastyId) => `Dynasty ${dynastyId}`,
				province: (provinceIdx) => `Province ${provinceIdx}`,
				culture: (cultureIdx) => `Culture ${cultureIdx}`,
				heritage: (heritageIdx) => `Heritage ${heritageIdx}`,
			}),
		).toEqual(["Dynasty 7", "Dynasty 4", ""])
	})

	it("uses era-specific town minimums for settlement labels", () => {
		const world = {
			params: { era: "information" },
			provinces: { count: 2 },
			settlementRegions: new Int32Array([0, 1]),
			urbanPopulation: new Float32Array([9_999, 10_000]),
		} as unknown as SerializedGenesisWorld

		expect(
			buildSettlementLabelNames(world, {
				nation: (capitalProvince) => `Nation at ${capitalProvince}`,
				dynasty: (dynastyId) => `Dynasty ${dynastyId}`,
				province: (provinceIdx) => `Province ${provinceIdx}`,
				culture: (cultureIdx) => `Culture ${cultureIdx}`,
				heritage: (heritageIdx) => `Heritage ${heritageIdx}`,
			}),
		).toEqual(["", "Province 1"])
	})
})
