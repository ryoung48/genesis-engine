import { describe, expect, it } from "vitest"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import {
	buildNationDynastyLabelNames,
	buildNationLabelNames,
} from "./label-names"

describe("label-names", () => {
	it("builds nation label names from nation capital provinces", () => {
		const world = {
			nations: {
				seeds: new Int32Array([4, 1]),
			},
		} as unknown as SerializedOrogenWorld

		expect(
			buildNationLabelNames(world, {
				nation: (capitalProvince) => `Nation at ${capitalProvince}`,
				dynasty: (dynastyId) => `Dynasty ${dynastyId}`,
				province: (provinceIdx) => `Province ${provinceIdx}`,
				culture: (cultureIdx) => `Culture ${cultureIdx}`,
				heritage: (heritageIdx) => `Heritage ${heritageIdx}`,
				faith: (faithIdx) => `Faith ${faithIdx}`,
				religion: (religionIdx) => `Religion ${religionIdx}`,
			}),
		).toEqual(["Nation at 4", "Nation at 1"])
	})

	it("builds dynasty label names from each nation capital dynasty", () => {
		const world = {
			nations: {
				seeds: new Int32Array([0, 2, 3]),
			},
			leaderDynasty: new Int32Array([7, -1, 4, -1]),
		} as unknown as SerializedOrogenWorld

		expect(
			buildNationDynastyLabelNames(world, {
				nation: (capitalProvince) => `Nation at ${capitalProvince}`,
				dynasty: (dynastyId) => `Dynasty ${dynastyId}`,
				province: (provinceIdx) => `Province ${provinceIdx}`,
				culture: (cultureIdx) => `Culture ${cultureIdx}`,
				heritage: (heritageIdx) => `Heritage ${heritageIdx}`,
				faith: (faithIdx) => `Faith ${faithIdx}`,
				religion: (religionIdx) => `Religion ${religionIdx}`,
			}),
		).toEqual(["Dynasty 7", "Dynasty 4", ""])
	})
})
