import type { StageTiming } from "@/model/shared/timing/types"
import type {
	CreateProgressParams,
	GenerationRequest,
	ProgressCheckpoint,
	SavedTimingRun,
	TimingCacheEntry,
	UpdateProgressParams,
} from "@/ui/genesis/generation/progress/types"

const STORAGE_KEY = "genesis-timing-v1"
const MAX_CONFIGURATIONS = 8
const MAX_RUNS = 5
const UPDATE_MS = 100
const MAX_PENDING_PERCENT = 99
const STAGE_APPROACH = 0.9

function configurationKey(request: GenerationRequest): string {
	const settings = Object.entries(request.params)
		.filter(([key, value]) => key !== "seed" && value !== undefined)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => [
			key,
			value !== null && typeof value === "object"
				? ArrayBuffer.isView(value)
					? value.byteLength
					: Array.isArray(value)
						? value.length
						: true
				: value,
		])
	return JSON.stringify([request.type, settings])
}

function isTiming(value: unknown): value is StageTiming {
	if (!value || typeof value !== "object") return false
	const entry = value as StageTiming
	return (
		typeof entry.Stage === "string" &&
		Number.isFinite(entry.ms) &&
		entry.ms >= 0 &&
		Array.isArray(entry.children) &&
		entry.children.every(isTiming)
	)
}

function isRun(value: unknown): value is SavedTimingRun {
	if (!value || typeof value !== "object") return false
	const run = value as SavedTimingRun
	return (
		Number.isFinite(run.totalMs) &&
		run.totalMs > 0 &&
		Array.isArray(run.timings) &&
		run.timings.every(isTiming) &&
		Array.isArray(run.checkpoints) &&
		run.checkpoints.every(
			(checkpoint, index) =>
				checkpoint &&
				typeof checkpoint.stage === "string" &&
				Number.isFinite(checkpoint.atMs) &&
				checkpoint.atMs >= 0 &&
				checkpoint.atMs <= run.totalMs &&
				(index === 0 || checkpoint.atMs >= run.checkpoints[index - 1].atMs),
		)
	)
}

function readCache(): TimingCacheEntry[] {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
		if (!Array.isArray(value)) return []
		return value
			.filter(
				(entry): entry is TimingCacheEntry =>
					entry &&
					typeof entry.key === "string" &&
					Array.isArray(entry.runs) &&
					entry.runs.length <= MAX_RUNS &&
					entry.runs.every(isRun),
			)
			.slice(-MAX_CONFIGURATIONS)
	} catch {
		return []
	}
}

function create({ request, setProgress, isCurrent }: CreateProgressParams) {
	const key = configurationKey(request)
	const runs = readCache().find((entry) => entry.key === key)?.runs ?? []
	const startedAt = performance.now()
	const checkpoints: ProgressCheckpoint[] = []
	const occurrences = new Map<string, number>()
	let activeStage = ""
	let activeStartedAt = startedAt
	let fallbackPercent = 0
	let currentPercent = 0
	let stopped = false

	function publish(percent: number): void {
		const next = Math.max(
			currentPercent,
			Math.min(MAX_PENDING_PERCENT, Math.max(0, percent)),
		)
		if (next > currentPercent) {
			currentPercent = next
			setProgress(next)
		}
	}

	function refresh(): void {
		if (!isCurrent()) {
			stop()
			return
		}
		let sum = 0
		let samples = 0
		for (const run of runs) {
			const index = run.checkpoints.findIndex(
				(checkpoint) => checkpoint.stage === activeStage,
			)
			if (index < 0) continue
			const current = run.checkpoints[index].atMs
			const next = run.checkpoints[index + 1]?.atMs ?? run.totalMs
			const duration = Math.max(1, next - current)
			const elapsed = performance.now() - activeStartedAt
			const fraction = STAGE_APPROACH * (1 - Math.exp(-elapsed / duration))
			sum +=
				(MAX_PENDING_PERCENT * (current + (next - current) * fraction)) /
				run.totalMs
			samples++
		}
		publish(samples > 0 ? sum / samples : fallbackPercent)
	}

	const interval = setInterval(refresh, UPDATE_MS)
	function stop(): void {
		stopped = true
		clearInterval(interval)
	}

	function update({ stage, percent }: UpdateProgressParams): void {
		if (stopped) return
		const occurrence = (occurrences.get(stage) ?? 0) + 1
		occurrences.set(stage, occurrence)
		activeStage = `${stage}:${occurrence}`
		activeStartedAt = performance.now()
		checkpoints.push({ stage: activeStage, atMs: activeStartedAt - startedAt })
		if (percent !== undefined && Number.isFinite(percent))
			fallbackPercent = percent
		refresh()
	}

	function complete(timings: StageTiming[]): void {
		if (stopped) return
		stop()
		const totalMs = performance.now() - startedAt
		if (totalMs <= 0 || !timings.length) return
		const cache = readCache()
		const previous = cache.find((entry) => entry.key === key)?.runs ?? []
		const run: SavedTimingRun = { totalMs, checkpoints, timings }
		const entries = [
			...cache.filter((entry) => entry.key !== key),
			{ key, runs: [...previous, run].slice(-MAX_RUNS) },
		].slice(-MAX_CONFIGURATIONS)
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
		} catch {
			return
		}
	}

	return { update, complete, stop }
}

export const GENERATION_PROGRESS = { create }
