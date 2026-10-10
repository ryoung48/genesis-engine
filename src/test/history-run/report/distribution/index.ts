import type { Distribution } from "@/test/history-run/report/distribution/types"

export const REPORT_DISTRIBUTION = {
	summarize(values: number[]): Distribution {
		if (values.length === 0) return { p50: 0, p90: 0 }
		const sorted = values.toSorted((a, b) => a - b)
		return {
			p50: sorted[Math.floor((sorted.length - 1) * 0.5)],
			p90: sorted[Math.floor((sorted.length - 1) * 0.9)],
		}
	},
}
