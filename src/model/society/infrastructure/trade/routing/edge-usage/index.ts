import type { RecordPathParams } from "@/model/society/infrastructure/trade/routing/edge-usage/types"

function recordPath({
	adjOffset,
	adjList,
	counts,
	pathRegions,
	firstEdge,
	endEdge,
}: RecordPathParams): void {
	for (let edge = firstEdge; edge < endEdge; edge++) {
		const a = pathRegions[edge - 1]
		const b = pathRegions[edge]
		for (let direction = 0; direction < 2; direction++) {
			const from = direction === 0 ? a : b
			const to = direction === 0 ? b : a
			for (let slot = adjOffset[from]; slot < adjOffset[from + 1]; slot++) {
				if (adjList[slot] !== to) continue
				counts[slot]++
				break
			}
		}
	}
}

export const EDGE_USAGE = { recordPath }
