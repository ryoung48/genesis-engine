export type ScanInterval = [number, number]

export interface ScanState {
	t: number
	value: number
	openS: number | null
	evaluations: number
}
export interface ScanCreateParams {
	f: (seconds: number) => number
	startS: number
}
export interface ScanRate {
	rate: number
	untilS: number
}
export interface ScanAdvanceParams {
	f: (seconds: number) => number
	state: ScanState
	endS: number
	rate: (seconds: number) => ScanRate
}
export interface ScanRangeParams {
	f: (seconds: number) => number
	startS: number
	endS: number
}
export interface ScanEarliestParams extends ScanRangeParams {
	threshold: number
}
export interface ScanMaximum {
	seconds: number
	value: number
	evaluations: number
}
export interface ScanPositiveParams extends ScanRangeParams {
	rate: (seconds: number) => ScanRate
}
export interface ScanIntersectParams {
	a: ScanInterval[]
	b: ScanInterval[]
}
