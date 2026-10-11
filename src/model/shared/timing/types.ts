export interface StageTiming {
	Stage: string
	ms: number
	children: StageTiming[]
}

export interface MeasureTimingParams<T> {
	stage: string
	timings: StageTiming[] | undefined
	fn: () => T
}

export interface RecordTimingParams {
	stage: string
	timings: StageTiming[] | undefined
	startedAt: number
}

export interface AppendTimingParams {
	stage: string
	timings: StageTiming[] | undefined
	ms: number
	children: StageTiming[]
}

export interface AttachTimingParams {
	timings: StageTiming[]
	stage: string
	children: StageTiming[]
}
