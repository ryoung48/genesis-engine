import type { SharedRng } from "@/model/shared/rng"

export type HistoryRng = Pick<
	SharedRng,
	"random" | "uniform" | "randint" | "choice" | "weightedChoice" | "shuffle"
>
