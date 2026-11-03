import type { BenchRunDetail } from "@/bench/types"

export interface ChartSeries {
	label: string
	color: string
	// [JUSTIFICATION] comparison and category charts can choose separate bar groups; ordinary series use the default stack
	group?: string
	values: (number | null)[]
}

export interface SeriesSpec {
	label: string
	color: string
	// [JUSTIFICATION] comparison and category charts can choose separate bar groups; ordinary series use the default stack
	group?: string
	values: (run: BenchRunDetail) => (number | null)[]
}

export type DrilldownFamily = "tribal" | "monarchy" | "republic" | "theocracy"
