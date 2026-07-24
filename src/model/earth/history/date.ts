/** Mirrors geo-explorer's src/utils/dateUtils.ts exactly, so event dates
 * (pre-converted by scripts/eu4_date.py) share the same numeric axis as the
 * UI slider bounds. See docs/earth-history-plan.md "UI wiring plan". */

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const EARTH_HISTORY_START_YEAR = 2
const EARTH_HISTORY_END_YEAR = 9999

function dayOfYear(month: number, day: number): number {
	return CUM_MONTH_DAYS[month - 1] + day
}

export function eu4DateToDays(dateStr: string): number {
	const [y, m, d] = dateStr.split(".").map(Number)
	const startD = dayOfYear(1, 1)
	const yearDays = (y - EARTH_HISTORY_START_YEAR) * 365
	return yearDays + dayOfYear(m, d) - startD
}

function daysToEu4Date(days: number): string {
	const startD = dayOfYear(1, 1)
	const totalDays = days + startD
	const yearIndex = Math.floor((totalDays - 1) / 365)
	const y = EARTH_HISTORY_START_YEAR + yearIndex
	// totalDays - 1 - yearIndex * 365 is in [0, 365) by construction of
	// yearIndex (a floor division), so this stays positive even when
	// totalDays is negative (BC dates) -- JS's `%` would return a negative
	// remainder there instead.
	let dayInYear = totalDays - 1 - yearIndex * 365 + 1

	let m = 1
	while (m <= 12 && dayInYear > MONTH_DAYS[m - 1]) {
		dayInYear -= MONTH_DAYS[m - 1]
		m++
	}
	return `${y}.${m}.${dayInYear}`
}

export function formatEu4Year(year: number): string {
	if (year <= 0) return `${1 - year} BC`
	return `${year} AD`
}

function formatEu4Date(dateStr: string): string {
	const [year, month, day] = dateStr.split(".").map(Number)
	if (
		!Number.isFinite(year) ||
		!Number.isFinite(month) ||
		!Number.isFinite(day)
	) {
		return dateStr
	}
	return `${formatEu4Year(year)}.${month}.${day}`
}

export function formatEu4Days(days: number): string {
	return formatEu4Date(daysToEu4Date(days))
}

export function eu4DaysToYear(days: number): number {
	return EARTH_HISTORY_START_YEAR + Math.floor(days / 365)
}

export const EARTH_HISTORY_MIN_DAYS = 0
export const EARTH_HISTORY_MAX_DAYS = eu4DateToDays(
	`${EARTH_HISTORY_END_YEAR}.12.31`,
)
export const EARTH_HISTORY_DEFAULT_START_DAYS = eu4DateToDays("1444.11.11")
