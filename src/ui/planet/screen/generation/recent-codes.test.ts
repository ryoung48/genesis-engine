import { describe, expect, it } from "vitest"
import {
	getOrderedRecentCodes,
	parseStoredCodeList,
	pushRecentCode,
	toggleStarredRecentCode,
} from "./recent-codes"

describe("recent code helpers", () => {
	it("parses stored code lists with deduplication and invalid entry filtering", () => {
		expect(parseStoredCodeList('["ABCD","EFGH","ABCD",12,""]')).toEqual([
			"ABCD",
			"EFGH",
		])
		expect(parseStoredCodeList("not json")).toEqual([])
	})

	it("keeps starred codes pinned to the bottom of the combined list", () => {
		expect(
			getOrderedRecentCodes(["ABCD", "EFGH", "IJKL"], ["IJKL", "MNOP"]),
		).toEqual(["ABCD", "EFGH", "IJKL", "MNOP"])
	})

	it("moves starred codes out of recents and restores them to the top when unstarred", () => {
		expect(
			toggleStarredRecentCode(["ABCD", "EFGH"], ["IJKL"], "EFGH", 3),
		).toEqual({
			recentCodes: ["ABCD"],
			starredRecentCodes: ["IJKL", "EFGH"],
		})

		expect(
			toggleStarredRecentCode(["ABCD"], ["IJKL", "EFGH"], "EFGH", 3),
		).toEqual({
			recentCodes: ["EFGH", "ABCD"],
			starredRecentCodes: ["IJKL"],
		})
	})

	it("does not reinsert starred codes into the recent queue when regenerated", () => {
		expect(
			pushRecentCode(["ABCD", "EFGH"], ["IJKL", "MNOP"], "IJKL", 2),
		).toEqual(["ABCD", "EFGH"])
		expect(pushRecentCode(["ABCD", "EFGH"], ["IJKL"], "MNOP", 2)).toEqual([
			"MNOP",
			"ABCD",
		])
	})
})
