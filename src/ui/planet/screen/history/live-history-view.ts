import { REL } from "@/model/history/state"
import type { SerializedHistoryFrame } from "@/model/transport/worker-types"
import type { HistoryView } from "./history-query"

export function buildLiveHistoryView(params: {
	selectedTimeMs: number
	simTimeMs: number
	liveFrame: SerializedHistoryFrame | null
}): HistoryView | null {
	const { selectedTimeMs, simTimeMs, liveFrame } = params
	if (!liveFrame || selectedTimeMs !== simTimeMs) {
		return null
	}

	const relationIndex = new Map<number, number>()
	for (let i = 0; i < liveFrame.relationValues.length; i++) {
		relationIndex.set(
			liveFrame.relationA[i] * liveFrame.assignment.length +
				liveFrame.relationB[i],
			liveFrame.relationValues[i],
		)
	}

	return {
		...liveFrame,
		populationRural: Float32Array.from(
			liveFrame.populationTotal,
			(total, index) =>
				Math.max(0, total - (liveFrame.populationUrban[index] ?? 0)),
		),
		relationAt: (a: number, b: number) =>
			relationIndex.get(a * liveFrame.assignment.length + b) ?? REL.NEUTRAL,
		forEachRelationPair: (cb: (a: number, b: number) => void) => {
			for (let i = 0; i < liveFrame.relationValues.length; i++) {
				const a = liveFrame.relationA[i]
				const b = liveFrame.relationB[i]
				if (a < b) cb(a, b)
			}
		},
		getNationWealth: (nationId: number) =>
			liveFrame.nationWealth?.[nationId] ?? 0,
		getNationOptimalWealth: (nationId: number) =>
			liveFrame.nationOptimalWealth?.[nationId] ?? 0,
	}
}
