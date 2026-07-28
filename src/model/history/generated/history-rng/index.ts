import { RNG, type SharedRng } from "@/model/shared/random/rng"

function createHistoryRng(seed: number): SharedRng {
	return RNG.createRng({ seed })
}

export const HISTORY_RNG = {
	createHistoryRng,
}
