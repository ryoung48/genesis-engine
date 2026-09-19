import { MONTH_MS, yearMs } from "@/model/history/sim/engine/state/index"
import type { DiffYearsParams } from "@/model/history/sim/engine/state/types"

export function deltaYear(years: number): number {
	return years * yearMs
}

export function deltaMonth(months: number): number {
	return months * MONTH_MS
}

export function diffYears({ a, b }: DiffYearsParams): number {
	return (a - b) / yearMs
}
