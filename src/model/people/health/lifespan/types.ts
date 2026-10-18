export interface HazardSegment {
	start: number
	end: number
	rate: number
}

export interface IntervalParams {
	birth: number
	health: number
	from: number
	to: number
}

export interface ProjectDeathParams extends IntervalParams {
	seed: number
	year: number
}
