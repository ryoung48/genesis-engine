import type { StageTiming } from "@/model/pipelines/types"

export function formatTimingSeconds(ms: number): string {
	return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 2)} s`
}

export interface TimingEntry {
	label: string
	ms: number
}

interface TimingSummary {
	entries: TimingEntry[]
	otherEntries: TimingEntry[]
	totalMs: number
}

const POST_TIMING_PREFIX = "Post:"

const COMPUTE_ROUTES_PREFIX = "computeRoutes:"

interface ParseTimingEntriesParams {
	timings: StageTiming[] | null | undefined
	filter: (stage: string) => boolean
}

interface GetTimingSummaryParams {
	timings: StageTiming[] | null | undefined
	filter: (stage: string) => boolean
	pinnedEntries: TimingEntry[]
}

function stripTimingPrefix(stage: string): string {
	if (stage.startsWith("genesis:")) return stage.slice("genesis:".length)
	if (stage.startsWith(`${POST_TIMING_PREFIX} `))
		return stage.slice(`${POST_TIMING_PREFIX} `.length)
	if (stage.startsWith(COMPUTE_ROUTES_PREFIX))
		return stage.slice(COMPUTE_ROUTES_PREFIX.length)
	return stage
}

function parseTimingEntries({
	timings,
	filter,
}: ParseTimingEntriesParams): TimingEntry[] {
	if (!timings?.length) return []

	return timings
		.map((entry) => {
			const ms = Number.parseFloat(entry.ms)
			if (!Number.isFinite(ms) || !filter(entry.Stage)) return null
			return { label: stripTimingPrefix(entry.Stage), ms }
		})
		.filter((entry): entry is TimingEntry => entry !== null)
}

function getTimingSummary({
	timings,
	filter,
	pinnedEntries,
}: GetTimingSummaryParams): TimingSummary | null {
	const orderedEntries = [
		...parseTimingEntries({ timings, filter }),
		...pinnedEntries,
	].sort((a, b) => b.ms - a.ms)

	if (!orderedEntries.length) return null

	const pinnedLabels = new Set(pinnedEntries.map((entry) => entry.label))
	const largeEntries = orderedEntries.filter(
		(entry) => entry.ms >= 100 || pinnedLabels.has(entry.label),
	)
	const otherEntries = orderedEntries.filter(
		(entry) => entry.ms < 100 && !pinnedLabels.has(entry.label),
	)
	const otherMs = otherEntries.reduce((sum, entry) => sum + entry.ms, 0)
	const entries =
		otherMs > 0
			? [...largeEntries, { label: "Other", ms: otherMs }]
			: largeEntries

	entries.sort((a, b) => b.ms - a.ms)

	return {
		entries,
		otherEntries,
		totalMs: orderedEntries.reduce((sum, entry) => sum + entry.ms, 0),
	}
}

export function getGenerationTimingSummary(
	timings?: StageTiming[] | null,
): TimingSummary | null {
	const computeRoutesSummary = getComputeRoutesTimingSummary(timings)
	return getTimingSummary({
		timings,
		filter: (stage) =>
			!stage.startsWith(POST_TIMING_PREFIX) &&
			!stage.startsWith(COMPUTE_ROUTES_PREFIX),
		pinnedEntries: computeRoutesSummary
			? [{ label: "computeRoutes", ms: computeRoutesSummary.totalMs }]
			: [],
	})
}

export function getPostTimingSummary(
	timings?: StageTiming[] | null,
): TimingSummary | null {
	return getTimingSummary({
		timings,
		filter: (stage) => stage.startsWith(POST_TIMING_PREFIX),
		pinnedEntries: [],
	})
}

export function getComputeRoutesTimingSummary(
	timings?: StageTiming[] | null,
): TimingSummary | null {
	return getTimingSummary({
		timings,
		filter: (stage) => stage.startsWith(COMPUTE_ROUTES_PREFIX),
		pinnedEntries: [],
	})
}
