export interface PathParams {
	start: number
	end: number
}
export interface PathElement {
	idx: number
	p: number
	d: number
}
export interface RestorePathParams extends PathParams {
	visited: Record<string, number>
}
