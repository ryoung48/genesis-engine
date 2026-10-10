import type {
	Distribution,
	PercentileParams,
} from "@/test/history-run/report/statistics/types"

export const REPORT_STATISTICS = {
	percentile({ values, fraction }: PercentileParams): number {
		if (values.length === 0) return 0
		const sorted = values.toSorted((a, b) => a - b)
		return sorted[Math.floor((sorted.length - 1) * fraction)]
	},
	summarize(values: number[]): Distribution {
		return {
			p50: REPORT_STATISTICS.percentile({ values, fraction: 0.5 }),
			p90: REPORT_STATISTICS.percentile({ values, fraction: 0.9 }),
		}
	},
}
