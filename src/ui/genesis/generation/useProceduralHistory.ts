import { useCallback, useRef, useState } from "react"
import type { RecordBatch } from "@/model/history/distribution/record/types"
import type { HistoryState } from "@/model/history/record/types"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import { STATE } from "@/model/history/sim/engine/state"
import type {
	GenesisWorkerRequest,
	ProceduralHistoryInitial,
} from "@/model/worker-protocol/types"
import type { ProceduralHistoryInput } from "@/ui/genesis/view/types"

export function useProceduralHistory(input: ProceduralHistoryInput) {
	const { workerRef } = input

	const [proceduralHistoryPlaying, setProceduralHistoryPlaying] =
		useState(false)
	const distributionStateRef = useRef<HistoryState | null>(null)
	const distributionBatchesRef = useRef<RecordBatch[]>([])
	const completedRef = useRef(false)
	const journalTransactionsRef = useRef<JournalTransaction[]>([])
	const [journalVersion, setJournalVersion] = useState(0)
	const startProceduralJournal = useCallback(
		(initial: ProceduralHistoryInitial | null) => {
			completedRef.current = false
			distributionStateRef.current =
				initial?.pipeline === "distribution" ? initial.state : null
			distributionBatchesRef.current = []
			journalTransactionsRef.current =
				initial?.pipeline === "simulation" ? initial.journal.slice() : []
			setJournalVersion((version) => version + 1)
		},
		[],
	)
	const recordProceduralJournal = useCallback(
		(transactions: JournalTransaction[]) => {
			journalTransactionsRef.current.push(...transactions)
			setJournalVersion((version) => version + 1)
		},
		[],
	)

	const recordDistributionBatch = useCallback((batch: RecordBatch) => {
		distributionBatchesRef.current.push(batch)
		setJournalVersion((version) => version + 1)
	}, [])
	const stopProceduralHistory = useCallback((complete: boolean) => {
		completedRef.current = complete
		setProceduralHistoryPlaying(false)
	}, [])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleToggleProceduralHistoryPlayback = useCallback(() => {
		if (!workerRef.current || completedRef.current) return
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
		distributionStateRef,
		distributionBatchesRef,
		recordDistributionBatch,
		stopProceduralHistory,
		journalTransactionsRef,
		journalVersion,
		startProceduralJournal,
		recordProceduralJournal,
		handleToggleProceduralHistoryPlayback,
		proceduralHistoryPlaying,
		setProceduralHistoryPlaying,
	}
}
