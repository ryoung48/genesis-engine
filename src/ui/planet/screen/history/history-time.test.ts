import { describe, expect, it } from "vitest"
import { YEAR_MS } from "@/model/history/state"
import {
	historyTimeParts,
	historyTimeToMonth,
	historyYearToTime,
} from "./history-time"

describe("historyTimeToMonth", () => {
	it("returns january at the start of a simulation year", () => {
		expect(historyTimeToMonth(historyYearToTime(800))).toBe(1)
	})

	it("tracks the month embedded in a selected simulation timestamp", () => {
		const timeMs = historyYearToTime(1200) + (200 * YEAR_MS) / 365

		expect(historyTimeToMonth(timeMs)).toBe(7)
		expect(historyTimeParts(timeMs)).toMatchObject({
			year: 1200,
			month: 7,
			day: 20,
		})
	})
})
