import type { SharedRng } from "@/model/shared/random/rng"

export type HistoryRng = Pick<
	SharedRng,
	"random" | "uniform" | "randint" | "choice" | "weightedChoice" | "shuffle"
>
