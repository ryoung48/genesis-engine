import type { ConditionChange } from "@/model/history/sim/people/health/ageing/types"
import type { PeopleState } from "@/model/history/sim/people/types"

export type HealthBand =
	| "Dying"
	| "Near death"
	| "Poor"
	| "Fine"
	| "Good"
	| "Excellent"

export interface HealthPersonParams {
	people: PeopleState
	person: number
}

// Times in years.
export interface HealthAtParams extends HealthPersonParams {
	time: number
}

export interface AdvanceParams extends HealthPersonParams {
	// The integer world year whose interval is projected.
	year: number
	// Band and condition changes are logged; an offline replay leaves only
	// where it ends.
	record: boolean
}

export interface ReplayParams extends HealthPersonParams {
	// The person is known to be alive then: no death is drawn earlier.
	survives: number
}

export interface HealthYearParams {
	people: PeopleState
	time: number
}

export interface HealthYear {
	// People whose death date was chosen this year.
	dying: number[]
	// People who became Incapable this year.
	incapacitated: number[]
}

export interface LogChangesParams extends HealthPersonParams {
	time: number
	changes: ConditionChange[]
}

export interface PulseParams extends HealthPersonParams {
	// The completed age-year being processed.
	age: number
}
