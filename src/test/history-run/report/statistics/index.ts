import type {
	Distribution,
	PercentileParams,
	SpearmanParams,
	WeightedPercentileParams,
} from "@/test/history-run/report/statistics/types"

function ranks(values: number[]): number[] {
	const order = values
		.map((v, i) => [v, i] as const)
		.sort((a, b) => a[0] - b[0])
	const out = new Array<number>(values.length)
	for (let i = 0; i < order.length; ) {
		let j = i
		while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
		for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2
		i = j + 1
	}
	return out
}

function spearman({ a, b }: SpearmanParams): number | null {
	if (a.length < 3) return null
	const ra = ranks(a)
	const rb = ranks(b)
	const n = a.length
	const ma = ra.reduce((s, v) => s + v, 0) / n
	const mb = rb.reduce((s, v) => s + v, 0) / n
	let cov = 0
	let va = 0
	let vb = 0
	for (let i = 0; i < n; i++) {
		cov += (ra[i] - ma) * (rb[i] - mb)
		va += (ra[i] - ma) ** 2
		vb += (rb[i] - mb) ** 2
	}
	return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null
}

function weightedPercentile({
	values,
	weights,
	fraction,
}: WeightedPercentileParams): number {
	if (values.length === 0) return 0
	const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
	const total = weights.reduce((sum, weight) => sum + weight, 0)
	let cumulative = 0
	for (const i of order) {
		cumulative += weights[i]
		if (cumulative >= fraction * total) return values[i]
	}
	return values[order[order.length - 1]]
}

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
	spearman,
	weightedPercentile,
}
