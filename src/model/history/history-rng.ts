import { createRng, type SharedRng } from "@/model/shared"

export type HistoryRng = Pick<
	SharedRng,
	"random" | "uniform" | "randint" | "choice" | "weightedChoice" | "shuffle"
>

export function createHistoryRng(seed: number): HistoryRng {
	return createRng(seed)
}
