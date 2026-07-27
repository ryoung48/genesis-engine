import type { DayOfYearParams } from "@/model/history/earth/date/types"

const CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const earthHistoryStartYear = 2

const EARTH_HISTORY_END_YEAR = 9999

function dayOfYear({ month, day }: DayOfYearParams): number {
	return CUM_MONTH_DAYS[month - 1] + day
}

function eu4DateToDays(dateStr: string): number {
	const [y, m, d] = dateStr.split(".").map(Number)
	const startD = dayOfYear({ month: 1, day: 1 })
	const yearDays = (y - earthHistoryStartYear) * 365
	return yearDays + dayOfYear({ month: m, day: d }) - startD
}

function daysToEu4Date(days: number): string {
	const startD = dayOfYear({ month: 1, day: 1 })
	const totalDays = days + startD
	const yearIndex = Math.floor((totalDays - 1) / 365)
	const y = earthHistoryStartYear + yearIndex
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

function formatEu4Year(year: number): string {
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

function formatEu4Days(days: number): string {
	return formatEu4Date(daysToEu4Date(days))
}

function eu4DaysToYear(days: number): number {
	return earthHistoryStartYear + Math.floor(days / 365)
}

const earthHistoryMinDays = 0

const earthHistoryMaxDays = eu4DateToDays(`${EARTH_HISTORY_END_YEAR}.12.31`)

const earthHistoryDefaultStartDays = eu4DateToDays("1444.11.11")

export const DATE = {
	earthHistoryStartYear,
	earthHistoryMinDays,
	earthHistoryMaxDays,
	earthHistoryDefaultStartDays,
	eu4DateToDays,
	formatEu4Year,
	formatEu4Days,
	eu4DaysToYear,
}
