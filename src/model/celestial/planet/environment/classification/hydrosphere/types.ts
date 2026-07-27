import type { SharedRng } from "@/model/shared/random/rng"

export interface WaterPctInput {
	rng: SharedRng
	hydrosphereCode: number
}

export interface CountBodiesInput {
	rng: SharedRng
	budget: number
	min: number
	max: number
}

export interface DistributeSurfaceInput {
	rng: SharedRng
	targetPct: number
	code: number
}

export interface BuildHydrosphereInput {
	rng: SharedRng
	code: number
}
