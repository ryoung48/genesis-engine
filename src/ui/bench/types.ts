import type { BenchRunDetail } from "@/bench/types"

export interface ChartSeries {
	label: string
	color: string
	// [JUSTIFICATION] only the development and knowledge chart groups its bars; other charts stack everything together
	group?: string
	values: (number | null)[]
}

export interface SeriesSpec {
	label: string
	color: string
	// [JUSTIFICATION] only the development and knowledge chart groups its bars; other charts stack everything together
	group?: string
	values: (run: BenchRunDetail) => (number | null)[]
}

export type DrilldownFamily = "tribal" | "monarchy" | "republic" | "theocracy"
