import type { DiffYearsParams } from "@/model/history/sim/engine/state/clock/types"

const DAYS_PER_YEAR = 365

const DAYS_PER_MONTH = 30

const HOURS_PER_DAY = 24

const DAY_MS = HOURS_PER_DAY * 60 * 60 * 1000

const yearMs = DAYS_PER_YEAR * DAY_MS

const MONTH_MS = DAYS_PER_MONTH * DAY_MS

function deltaYear(years: number): number {
	return years * yearMs
}

function deltaMonth(months: number): number {
	return months * MONTH_MS
}

function diffYears({ a, b }: DiffYearsParams): number {
	return (a - b) / yearMs
}

const DEFAULT_START_YEAR = 867

export const STATE_CLOCK = {
	defaultStartYear: DEFAULT_START_YEAR,
	yearMs,
	deltaYear,
	deltaMonth,
	diffYears,
}
