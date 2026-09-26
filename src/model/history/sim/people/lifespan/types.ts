import type { Sex } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface HazardParams {
	age: number
	sex: Sex
}

export interface DeathAtParams {
	sex: Sex
	birth: number
	from: number
	rng: SharedRng
}
