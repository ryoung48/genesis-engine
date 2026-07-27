import { SharedRng, RNG } from "@/model/shared/rng"

export type HistoryRng = Pick<
	SharedRng,
	"random" | "uniform" | "randint" | "choice" | "weightedChoice" | "shuffle"
>

export function createHistoryRng(seed: number): HistoryRng {
	return RNG.createRng({ seed })
}
