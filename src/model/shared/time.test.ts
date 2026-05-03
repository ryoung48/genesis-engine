import { describe, expect, it } from "vitest"
import { TIME } from "./time"

describe("TIME", () => {
	it("round-trips years through the custom epoch helpers", () => {
		const date = TIME.date.fromYear(12)

		expect(TIME.date.toYear(date)).toBe(12)
		expect(TIME.date.format(date)).toBe("Jan 1, Year 12")
		expect(TIME.date.diffYears(TIME.date.fromYear(15), date)).toBeCloseTo(3, 2)
	})

	it("deconstructs raw hours into days, hours, minutes, and seconds", () => {
		expect(TIME.hours.deconstruct(49.75)).toEqual({
			days: 2,
			hours: 1,
			minutes: 45,
			seconds: 0,
		})
	})

	it("splits months into deterministic day ranges and maps seasons", () => {
		expect(TIME.month.days(0)).toEqual(
			Array.from({ length: 30 }, (_, index) => index),
		)
		expect(TIME.month.days(11).length).toBe(31)
		expect(TIME.season(0)).toBe("winter")
		expect(TIME.season(2)).toBe("spring")
		expect(TIME.season(5)).toBe("summer")
		expect(TIME.season(8)).toBe("autumn")
	})
})
