import type { HistoryRng } from "@/model/history/generated/history-rng/types"
import { RNG } from "@/model/shared/random/rng"

function createHistoryRng(seed: number): HistoryRng {
	return RNG.createRng({ seed })
}

export const HISTORY_RNG = {
	createHistoryRng,
}
