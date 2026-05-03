import { describe, expect, it } from "vitest"
import { read, type Timeline, write } from "./timeline"

describe("timeline read/write helpers", () => {
	it("returns the default when no entry exists at or before the requested time", () => {
		const timeline: Timeline<number> = [{ time: 10, value: 4 }]

		expect(read(timeline, -1, 5)).toBe(-1)
	})

	it("returns the most recent value at or before the requested time", () => {
		const timeline: Timeline<number> = [
			{ time: 10, value: 2 },
			{ time: 20, value: 5 },
			{ time: 30, value: 9 },
		]

		expect(read(timeline, 0, 25)).toBe(5)
		expect(read(timeline, 0)).toBe(9)
	})

	it("skips appending consecutive duplicate values", () => {
		const timeline: Timeline<number> = [{ time: 10, value: 3 }]

		write(timeline, 20, 3)

		expect(timeline).toEqual([{ time: 10, value: 3 }])
	})

	it("replaces same-time entries and collapses them when matching the prior value", () => {
		const timeline: Timeline<number> = [
			{ time: 10, value: 1 },
			{ time: 20, value: 2 },
		]

		write(timeline, 20, 1)

		expect(timeline).toEqual([{ time: 10, value: 1 }])
	})
})
