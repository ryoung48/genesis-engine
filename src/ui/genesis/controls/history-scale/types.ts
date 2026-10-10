export type HistoryScale = { kind: "linear" } | { kind: "phased" }
export interface ScaleParams {
	scale: HistoryScale
	timeMs: number
}
export interface DecodeParams {
	scale: HistoryScale
	value: number
	minTimeMs: number
	maxTimeMs: number
}
export interface StepParams {
	scale: HistoryScale
	timeMs: number
	direction: -1 | 1
	stepMs: number
	minTimeMs: number
	maxTimeMs: number
}
