import { MONTH_MS, YEAR_MS } from "@/model/orogen/history/state"

export const HISTORY_MONTH_STEP_MS = MONTH_MS
export const HISTORY_DAY_STEP_MS = YEAR_MS / 365
const HISTORY_MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function historyYearToTime(year: number): number {
	return year * YEAR_MS
}

export function historyTimeToYear(timeMs: number): number {
	return Math.floor(timeMs / YEAR_MS)
}

export function historyTimeParts(timeMs: number): {
	year: number
	month: number
	day: number
} {
	const year = historyTimeToYear(timeMs)
	const yearOffset = Math.max(0, timeMs - year * YEAR_MS)
	let dayOfYear = Math.floor(yearOffset / HISTORY_DAY_STEP_MS)
	dayOfYear = Math.min(dayOfYear, 364)
	let month = 0
	while (
		month < HISTORY_MONTH_LENGTHS.length - 1 &&
		dayOfYear >= HISTORY_MONTH_LENGTHS[month]
	) {
		dayOfYear -= HISTORY_MONTH_LENGTHS[month]
		month += 1
	}
	return {
		year,
		month: month + 1,
		day: dayOfYear + 1,
	}
}

export function formatHistoryTime(timeMs: number): string {
	const { year, month, day } = historyTimeParts(timeMs)
	return `Y${year} M${month} D${day}`
}
