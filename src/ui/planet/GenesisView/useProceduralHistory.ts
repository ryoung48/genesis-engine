import { useCallback, useRef, useState } from "react"
import { HISTORY_DAYS } from "@/model/history/generated/history-days"
import { STATE } from "@/model/history/generated/state"
import type { HistoryNote } from "@/model/history/generated/state/types"
import type {
	GenesisWorkerRequest,
	SerializedHistoryFrame,
} from "@/model/worker-protocol/types"
import type { ProceduralHistoryInput } from "@/ui/planet/GenesisView/types"
import type { WikiCountHistoryPoint } from "@/ui/wiki/shared/WikiTimeline"
/**
 * Owns the procedural (non-Earth-import) live-play history sim. Unlike
 * earthHistory -- a precomputed fold scrubbable across the whole span --
 * procedural worlds only ever exist as far as "simulate" has ticked them
 * forward in the worker (see PROCEDURAL-HISTORY-PLAN.md). There is no stored
 * past: only the latest frame is kept, plus the running event log and
 * per-nation province-count series the wiki timeline needs, so playback can
 * only play/pause at the sim's current time, never scrub backward.
 */
export function useProceduralHistory(input: ProceduralHistoryInput) {
	const { workerRef } = input

	const [proceduralHistoryFrame, setProceduralHistoryFrame] =
		useState<SerializedHistoryFrame | null>(null)
	const [proceduralHistoryTimeMs, setProceduralHistoryTimeMs] = useState(
		800 * STATE.yearMs,
	)
	const [proceduralHistoryPlaying, setProceduralHistoryPlaying] =
		useState(false)
	// All HistoryNotes observed so far, growing as "sim-progress" ticks
	// arrive, for the wiki page's per-nation timeline.
	const proceduralHistoryEventsRef = useRef<HistoryNote[]>([])
	// Per-nation running province-count series, appended only when a
	// nation's count actually changes (WikiCountHistoryPoint's step-chart
	// contract -- see WikiTimeline.tsx).
	const proceduralProvinceHistoryRef = useRef<
		Map<number, WikiCountHistoryPoint[]>
	>(new Map())
	const proceduralLastCountsRef = useRef<Map<number, number>>(new Map())

	const resetProceduralHistoryAccumulation = useCallback(() => {
		proceduralHistoryEventsRef.current = []
		proceduralProvinceHistoryRef.current = new Map()
		proceduralLastCountsRef.current = new Map()
	}, [])

	const recordProceduralFrame = useCallback(
		(
			timeMs: number,
			frame: SerializedHistoryFrame,
			newEvents: HistoryNote[],
		) => {
			if (newEvents.length > 0) {
				proceduralHistoryEventsRef.current =
					proceduralHistoryEventsRef.current.concat(newEvents)
			}
			const days = HISTORY_DAYS.historyMsToDays(timeMs)
			const counts = new Map<number, number>()
			for (const nationId of frame.assignment) {
				if (nationId < 0) continue
				counts.set(nationId, (counts.get(nationId) ?? 0) + 1)
			}
			const last = proceduralLastCountsRef.current
			for (const [nationId, count] of counts) {
				if (last.get(nationId) !== count) {
					const series =
						proceduralProvinceHistoryRef.current.get(nationId) ?? []
					series.push({ date: days, count })
					proceduralProvinceHistoryRef.current.set(nationId, series)
				}
			}
			for (const nationId of last.keys()) {
				if (!counts.has(nationId) && last.get(nationId) !== 0) {
					const series =
						proceduralProvinceHistoryRef.current.get(nationId) ?? []
					series.push({ date: days, count: 0 })
					proceduralProvinceHistoryRef.current.set(nationId, series)
				}
			}
			proceduralLastCountsRef.current = counts
			setProceduralHistoryFrame(frame)
			setProceduralHistoryTimeMs(timeMs)
		},
		[],
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleToggleProceduralHistoryPlayback = useCallback(() => {
		if (!workerRef.current) return
		if (proceduralHistoryPlaying) {
			workerRef.current.postMessage({
				type: "pause",
			} satisfies GenesisWorkerRequest)
			setProceduralHistoryPlaying(false)
		} else {
			workerRef.current.postMessage({
				type: "simulate",
				tickMs: STATE.yearMs,
			} satisfies GenesisWorkerRequest)
			setProceduralHistoryPlaying(true)
		}
	}, [proceduralHistoryPlaying])

	return {
		handleToggleProceduralHistoryPlayback,
		proceduralHistoryEventsRef,
		proceduralHistoryFrame,
		proceduralHistoryPlaying,
		proceduralHistoryTimeMs,
		proceduralProvinceHistoryRef,
		recordProceduralFrame,
		resetProceduralHistoryAccumulation,
		setProceduralHistoryFrame,
		setProceduralHistoryPlaying,
		setProceduralHistoryTimeMs,
	}
}
