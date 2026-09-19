import { useCallback, useRef, useState } from "react"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import { STATE } from "@/model/history/sim/engine/state"
import type { GenesisWorkerRequest } from "@/model/worker-protocol/types"
import type { ProceduralHistoryInput } from "@/ui/genesis/view/types"

export function useProceduralHistory(input: ProceduralHistoryInput) {
	const { workerRef } = input

	const [proceduralHistoryPlaying, setProceduralHistoryPlaying] =
		useState(false)
	const journalTransactionsRef = useRef<JournalTransaction[]>([])
	const [journalVersion, setJournalVersion] = useState(0)
	const startProceduralJournal = useCallback(
		(transactions: JournalTransaction[]) => {
			journalTransactionsRef.current = transactions.slice()
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
		journalTransactionsRef,
		journalVersion,
		startProceduralJournal,
		recordProceduralJournal,
		handleToggleProceduralHistoryPlayback,
		proceduralHistoryPlaying,
		setProceduralHistoryPlaying,
	}
}
