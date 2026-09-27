import type { SharedRng } from "@/model/shared/random/rng"

export interface DeathAtParams {
	birth: number
	from: number
	rng: SharedRng
}
