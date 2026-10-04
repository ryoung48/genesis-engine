// A stretch of an interval with one yearly death rate.
export interface HazardSegment {
	start: number
	end: number
	rate: number
}

export interface IntervalParams {
	birth: number
	// Effective health, held constant over the interval.
	health: number
	from: number
	to: number
}

export interface ProjectDeathParams extends IntervalParams {
	seed: number
	// The world year whose interval this is; salts the rolls.
	year: number
}
