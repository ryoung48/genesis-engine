import type { SharedRng } from "@/model/shared/rng"

export interface CreateRngOptions {
	nonPositiveWeightBehavior?: "first" | "undefined"
}

export type GenesisRng = Pick<SharedRng, "random" | "randint">

export interface CreateRngParams {
	seed: number
	options?: CreateRngOptions
}

export interface CreateStringRngParams {
	seed: string
	options?: CreateRngOptions
}
