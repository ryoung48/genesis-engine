import { MONTH_MS, yearMs } from "@/model/history/generated/state/index"
import type { DiffYearsParams } from "@/model/history/generated/state/types"
import type { Timeline } from "@/model/history/generated/timeline/types"

export function deltaYear(years: number): number {
	return years * yearMs
}

export function deltaMonth(months: number): number {
	return months * MONTH_MS
}

export function diffYears({ a, b }: DiffYearsParams): number {
	return (a - b) / yearMs
}

export function makeTimelineArray<T>(length: number): Timeline<T>[] {
	return Array.from({ length }, (): Timeline<T> => [])
}
