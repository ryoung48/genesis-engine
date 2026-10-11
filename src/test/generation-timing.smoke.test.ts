import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TIMING } from "@/model/shared/timing"
import type { StageTiming } from "@/model/shared/timing/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { GENERATION_PROGRESS } from "@/ui/genesis/generation/progress"
import type {
	GenerationRequest,
	TimingCacheEntry,
} from "@/ui/genesis/generation/progress/types"
import { getGenerationTimingSummary } from "@/ui/wiki/timing/timing-summary"

const timings: StageTiming[] = [
	{
		Stage: "Generation",
		ms: 1000,
		children: [
			{
				Stage: "Terrain",
				ms: 800,
				children: [{ Stage: "Elevation", ms: 700, children: [] }],
			},
			{ Stage: "Society", ms: 100, children: [] },
		],
	},
]
const request: GenerationRequest = {
	type: "generate",
	params: { ...DEFAULT_WORLD_PARAMS, seed: 1, tideLock: null },
}
const storage = new Map<string, string>()

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] })
	storage.clear()
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => storage.set(key, value),
	})
})
afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

function saveRun(duration: number): void {
	const tracker = GENERATION_PROGRESS.create({
		request,
		setProgress: vi.fn(),
		isCurrent: () => true,
	})
	tracker.update({ stage: "mesh", percent: 3 })
	vi.advanceTimersByTime(duration / 2)
	tracker.update({ stage: "society", percent: 77 })
	vi.advanceTimersByTime(duration / 2)
	tracker.complete(timings)
}

function cachedEntries(): TimingCacheEntry[] {
	return JSON.parse([...storage.values()][0] ?? "[]") as TimingCacheEntry[]
}

describe("generation timing", () => {
	it("uses parent durations and exposes nested detail without double counting", () => {
		expect(getGenerationTimingSummary({ timings, path: [] })?.totalMs).toBe(
			1000,
		)
		const summary = getGenerationTimingSummary({
			timings,
			path: ["Generation"],
		})
		expect(summary?.entries).toContainEqual({
			label: "Uninstrumented",
			ms: 100,
			expandable: false,
		})
		expect(
			getGenerationTimingSummary({ timings, path: ["Generation", "Terrain"] })
				?.totalMs,
		).toBe(800)
	})

	it("records measurements even when a stage throws", () => {
		const entries: StageTiming[] = []
		expect(() =>
			TIMING.measure({
				stage: "failed",
				timings: entries,
				fn: () => {
					vi.advanceTimersByTime(20)
					throw new Error("failed")
				},
			}),
		).toThrow("failed")
		expect(entries).toEqual([{ Stage: "failed", ms: 20, children: [] }])
	})

	it("learns comparable runs across seeds, advances gently, and stops below completion", () => {
		saveRun(1000)
		saveRun(2000)
		const values: number[] = []
		const tracker = GENERATION_PROGRESS.create({
			request: { ...request, params: { ...request.params, seed: 2 } },
			setProgress: (value) => values.push(value),
			isCurrent: () => true,
		})
		tracker.update({ stage: "mesh", percent: 3 })
		vi.advanceTimersByTime(500)
		expect(values.at(-1)).toBeGreaterThan(3)
		expect(values.at(-1)).toBeLessThan(49.5)
		tracker.update({ stage: "society", percent: 77 })
		expect(values.at(-1)).toBe(49.5)
		vi.advanceTimersByTime(100000)
		expect(values.at(-1)).toBeLessThan(99)
		expect(
			values.every((value, index) => index === 0 || value >= values[index - 1]),
		).toBe(true)
		tracker.stop()
		const count = values.length
		vi.advanceTimersByTime(1000)
		expect(values).toHaveLength(count)
		expect(cachedEntries()[0].runs).toHaveLength(2)
	})

	it("falls back for different settings and never reverses progress", () => {
		saveRun(1000)
		const values: number[] = []
		const tracker = GENERATION_PROGRESS.create({
			request: { ...request, params: { ...request.params, numPoints: 4000 } },
			setProgress: (value) => values.push(value),
			isCurrent: () => true,
		})
		tracker.update({ stage: "mesh", percent: 5 })
		tracker.update({ stage: "climate", percent: 3 })
		vi.advanceTimersByTime(500)
		expect(values).toEqual([5])
		tracker.update({ stage: "done", percent: 100 })
		expect(values.at(-1)).toBe(99)
		tracker.stop()
	})

	it("bounds saved runs and configurations and does not save cancelled work", () => {
		for (let index = 0; index < 7; index++) saveRun(1000)
		expect(cachedEntries()[0].runs).toHaveLength(5)
		for (let index = 0; index < 10; index++) {
			const tracker = GENERATION_PROGRESS.create({
				request: {
					...request,
					params: { ...request.params, numPoints: index + 1000 },
				},
				setProgress: vi.fn(),
				isCurrent: () => true,
			})
			vi.advanceTimersByTime(10)
			tracker.complete(timings)
		}
		expect(cachedEntries()).toHaveLength(8)
		const snapshot = [...storage.values()][0]
		const tracker = GENERATION_PROGRESS.create({
			request,
			setProgress: vi.fn(),
			isCurrent: () => true,
		})
		tracker.stop()
		tracker.complete(timings)
		expect([...storage.values()][0]).toBe(snapshot)
	})

	it("handles unavailable or invalid storage and disposes superseded trackers", () => {
		storage.set("genesis-timing-v1", "invalid json")
		const setProgress = vi.fn()
		let current = true
		const tracker = GENERATION_PROGRESS.create({
			request,
			setProgress,
			isCurrent: () => current,
		})
		tracker.update({ stage: "mesh", percent: 5 })
		current = false
		vi.advanceTimersByTime(100)
		tracker.update({ stage: "society", percent: 77 })
		expect(setProgress).toHaveBeenCalledTimes(1)
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("blocked")
			},
			setItem: () => {
				throw new Error("quota")
			},
		})
		expect(() => {
			const next = GENERATION_PROGRESS.create({
				request,
				setProgress,
				isCurrent: () => true,
			})
			vi.advanceTimersByTime(10)
			next.complete(timings)
		}).not.toThrow()
	})
})
