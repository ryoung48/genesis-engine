import type { BenchRunDetail } from "@/bench/types"

export interface ChartSeries {
	label: string
	color: string
	values: (number | null)[]
}

export interface SeriesSpec {
	label: string
	color: string
	values: (run: BenchRunDetail) => (number | null)[]
}

export type DrilldownFamily = "tribal" | "monarchy" | "republic" | "theocracy"
