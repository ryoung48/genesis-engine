import type {
	Distribution,
	PercentileParams,
} from "@/test/history-run/report/distribution/types"

function percentile({ values, q }: PercentileParams): number {
	if (values.length === 0) return 0
	const sorted = values.toSorted((a, b) => a - b)
	return sorted[Math.floor((sorted.length - 1) * q)]
}

export const REPORT_DISTRIBUTION = {
	percentile,
	summarize(values: number[]): Distribution {
		return {
			p50: percentile({ values, q: 0.5 }),
			p90: percentile({ values, q: 0.9 }),
		}
	},
}
