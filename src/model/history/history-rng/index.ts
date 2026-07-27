import type { HistoryRng } from "@/model/history/history-rng/types"
import { RNG } from "@/model/shared/rng"

function createHistoryRng(seed: number): HistoryRng {
	return RNG.createRng({ seed })
}

export const HISTORY_RNG = {
	createHistoryRng,
}
