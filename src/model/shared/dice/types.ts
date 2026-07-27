import type { SharedRng } from "@/model/shared/rng"

export interface RollDiceInput {
	rng: Pick<SharedRng, "randint">
	count: number
	sides: number
}
