import type { SharedRng } from "@/model/shared/random/rng"

export interface RollGreenhouseFactorParams {
	rng: Pick<SharedRng, "randint">
	pressureBar: number
	atmosphereCode: number
}
