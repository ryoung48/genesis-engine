export interface StepTemperatureParams {
	tIdx: number
	dt: number
	lower: readonly number[]
	upper: readonly number[]
}

export interface RunModelParams {
	years: number
	// Maximum timestep in 1/365-orbit days, scaled to the configured orbital period.
	dtDays: number
}

export interface ColumnTermsParams {
	tIdx: number
	dt: number
	heatCapacity: readonly number[]
	temperature: number[]
	albedo: number[][]
	olr: number[][]
}

export interface ColumnTerms {
	diagSelf: number[]
	rhs: number[]
}
