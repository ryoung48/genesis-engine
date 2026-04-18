import { describe, expect, it } from "vitest"
import { REL } from "@/model/orogen/history/state"
import type { HistoryView } from "./history-query"
import {
	buildConflictDistribution,
	buildNationSizeDistribution,
	buildRelationDistribution,
} from "./nation-details-model"

describe("buildNationSizeDistribution", () => {
	it("counts nations into size buckets", () => {
		const counts = new Map([
			[0, 1],
			[1, 3],
			[2, 60],
		])

		const result = buildNationSizeDistribution(counts)

		const bucket1 = result.find((b) => b.label === "1")
		const bucket2_4 = result.find((b) => b.label === "2-4")
		const bucket50plus = result.find((b) => b.label === "50+")

		expect(bucket1?.count).toBe(1)
		expect(bucket2_4?.count).toBe(1)
		expect(bucket50plus?.count).toBe(1)
	})

	it("returns 6 buckets matching NATION_BUCKETS length", () => {
		const result = buildNationSizeDistribution(new Map())
		expect(result).toHaveLength(6)
	})
})

describe("buildConflictDistribution", () => {
	it("returns zero counts when no history view", () => {
		const result = buildConflictDistribution(null)
		expect(result.find((b) => b.label === "Wars")?.count).toBe(0)
		expect(result.find((b) => b.label === "Rebellions")?.count).toBe(0)
	})

	it("separates wars from rebellions", () => {
		const view = {
			activeWars: [{ rebel: false }, { rebel: false }, { rebel: true }],
		} as unknown as HistoryView

		const result = buildConflictDistribution(view)

		expect(result.find((b) => b.label === "Wars")?.count).toBe(2)
		expect(result.find((b) => b.label === "Rebellions")?.count).toBe(1)
	})
})

describe("buildRelationDistribution", () => {
	it("returns empty array when no history view", () => {
		const result = buildRelationDistribution(null, new Map())
		expect(result).toEqual([])
	})

	it("counts allied pairs", () => {
		const nations = [0, 1, 2]
		const relations = new Map<string, number>([
			["0,1", REL.ALLY],
			["0,2", REL.NEUTRAL],
			["1,2", REL.RIVAL],
		])
		const view = {
			relationAt: (a: number, b: number) =>
				relations.get(`${Math.min(a, b)},${Math.max(a, b)}`) ?? REL.NEUTRAL,
		} as unknown as HistoryView
		const counts = new Map(nations.map((id) => [id, 1]))

		const result = buildRelationDistribution(view, counts)

		expect(result.find((b) => b.label === "Allied")?.count).toBe(1)
		expect(result.find((b) => b.label === "Rival")?.count).toBe(1)
	})
})
