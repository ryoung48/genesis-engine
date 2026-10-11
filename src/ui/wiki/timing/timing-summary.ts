import type { StageTiming } from "@/model/shared/timing/types"
import type { TimingSummary, TimingSummaryParams } from "@/ui/wiki/timing/types"

export function formatTimingSeconds(ms: number): string {
	return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 2)} s`
}

export function getGenerationTimingSummary({
	timings,
	path,
}: TimingSummaryParams): TimingSummary | null {
	if (!timings?.length) return null
	let entries: StageTiming[] = timings
	let totalMs = entries.reduce((sum, entry) => sum + entry.ms, 0)
	for (const label of path) {
		const entry = entries.find((entry) => entry.Stage === label)
		if (!entry) return null
		totalMs = entry.ms
		entries = entry.children
	}
	const rows = entries.map((entry) => ({
		label: entry.Stage,
		ms: entry.ms,
		expandable: entry.children.length > 0,
	}))
	const remainder = totalMs - entries.reduce((sum, entry) => sum + entry.ms, 0)
	if (remainder >= 1)
		rows.push({ label: "Uninstrumented", ms: remainder, expandable: false })
	return { entries: rows.sort((a, b) => b.ms - a.ms), totalMs }
}
