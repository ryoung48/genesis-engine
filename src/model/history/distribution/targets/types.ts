export interface YearParams {
	year: number
}

export interface ProjectionParams {
	capacities: number[]
	year: number
}

export interface SegmentParams {
	axis: number[]
	year: number
}
export interface LandStatus {
	stateHeld: number
}
export interface HeldCapacitiesParams {
	habitableCount: number
	capacities: number[]
	year: number
}
