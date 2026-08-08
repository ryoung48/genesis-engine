export interface StepTemperatureParams {
	tIdx: number
	dt: number
	lower: readonly number[]
	diag: readonly number[]
	upper: readonly number[]
}

export interface RunModelParams {
	years: number
	dtDays: number
}
