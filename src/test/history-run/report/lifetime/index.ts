import { DATE } from "@/model/history/earth/date"
import type {
	LifetimeParams,
	LifetimeSummary,
} from "@/test/history-run/report/lifetime/types"
import { REPORT_STATISTICS } from "@/test/history-run/report/statistics"

const MS_PER_YEAR = 365 * 86_400_000

function summarize({ nations, windows }: LifetimeParams): LifetimeSummary[] {
	const real = nations.filter((n) => !n.isRebel)
	return windows.map(({ from, to }) => {
		const lifetimes = real
			.filter((n) => {
				if (n.deathTimeMs < 0) return false
				const year = DATE.historyTimeMsToYear(n.deathTimeMs)
				return year >= from && year <= to
			})
			.map((n) => (n.deathTimeMs - n.birthTimeMs) / MS_PER_YEAR)
		const at = (fraction: number) =>
			REPORT_STATISTICS.percentile({ values: lifetimes, fraction })
		return {
			from,
			to,
			ended: lifetimes.length,
			alive: real.filter((n) => n.deathTimeMs < 0).length,
			mean: lifetimes.length
				? lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length
				: 0,
			p10: at(0.1),
			p25: at(0.25),
			p50: at(0.5),
			p75: at(0.75),
			p90: at(0.9),
		}
	})
}

export const REPORT_LIFETIME = { summarize }
