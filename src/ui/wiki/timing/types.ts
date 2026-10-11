import type { StageTiming } from "@/model/shared/timing/types"

export interface TimingEntry {
	label: string
	ms: number
	expandable: boolean
}

export interface TimingSummary {
	entries: TimingEntry[]
	totalMs: number
}

export interface TimingSummaryParams {
	timings: StageTiming[] | null | undefined
	path: string[]
}
