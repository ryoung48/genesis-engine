import type { PeopleState } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface CheckLifeParams {
	people: PeopleState
	person: number
	from: number
	rng: SharedRng
}

export interface LifeCheck {
	// [JUSTIFICATION] Most people survive the year, so no death date exists.
	death?: number
	oldBand: number
	newBand: number
}

export interface RollLifeYearParams {
	age: number
	health: number
	rng: SharedRng
}

export interface LifeYearRoll {
	health: number
	// [JUSTIFICATION] A surviving year has no death offset.
	deathOffset?: number
}

export interface LifeTrajectoryParams {
	birth: number
	until: number
	sex: 0 | 1
	rng: SharedRng
	requireAlive: boolean
	initialHealth: number | null
}

export interface LifeTrajectory {
	health: number
	death: number
}
