import { describe, expect, it } from "vitest"
import { getNearestHistoryPointIndex } from "./history-chart-utils"

describe("getNearestHistoryPointIndex", () => {
	const history = [
		{ timeMs: 100 },
		{ timeMs: 200 },
		{ timeMs: 300 },
		{ timeMs: 400 },
	]

	it("returns the exact matching index when the timestamp exists", () => {
		expect(getNearestHistoryPointIndex(history, 300)).toBe(2)
	})

	it("snaps to the nearest earlier yearly sample when between points", () => {
		expect(getNearestHistoryPointIndex(history, 240)).toBe(1)
	})

	it("clamps to the first and last point outside the sampled range", () => {
		expect(getNearestHistoryPointIndex(history, 50)).toBe(0)
		expect(getNearestHistoryPointIndex(history, 999)).toBe(3)
	})
})
