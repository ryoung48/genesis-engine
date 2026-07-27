import type { SharedRng } from "@/model/shared/rng"

export interface RollGreenhouseFactorParams {
	rng: Pick<SharedRng, "randint">
	pressureBar: number
	atmosphereCode: number
}
