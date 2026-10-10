import { expect, it } from "vitest"
import { DATE } from "@/model/history/earth/date"
import { HISTORY_SCALE as S } from "@/ui/genesis/controls/history-scale"

const scale = { kind: "phased" } as const
const time = (year: number) => DATE.eu4DateToTimeMs(`${year}.1.1`)
const minTimeMs = time(-79999),
	maxTimeMs = time(2025)
it("round trips phase boundaries and midpoints with 70 percent for politics", () => {
	for (const year of [-79999, -44999, -9999, -6650, -3300, 0, 2025]) {
		const value = S.encode({ scale, timeMs: time(year) })
		expect(S.decode({ scale, value, minTimeMs, maxTimeMs })).toBe(time(year))
	}
	expect(S.encode({ scale, timeMs: time(-9999) })).toBe(0.2)
	expect(S.encode({ scale, timeMs: time(-3300) })).toBe(0.3)
	expect(S.decode({ scale, value: 1, minTimeMs, maxTimeMs: time(-4000) })).toBe(
		time(-4000),
	)
	expect(S.decode({ scale, value: 1, minTimeMs, maxTimeMs: minTimeMs })).toBe(
		minTimeMs,
	)
})
it("steps according to the phase on the selected side of a boundary", () => {
	for (const [year, direction, expected] of [
		[-9999, -1, -10499],
		[-9999, 1, -9899],
		[-3300, -1, -3400],
		[-3300, 1, -3299],
		[-10000, 1, -9999],
		[2025, 1, 2025],
	] as const)
		expect(
			S.step({
				scale,
				timeMs: time(year),
				direction,
				stepMs: 365 * 86400000,
				minTimeMs,
				maxTimeMs,
			}),
		).toBe(time(expected))
})
