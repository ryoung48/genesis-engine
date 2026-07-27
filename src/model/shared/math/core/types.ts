export interface EulerVelocityAtParams {
	pole: [number, number, number]
	omega: number
	x: number
	y: number
	z: number
}

export interface ClampParams {
	value: number
	lo: number
	hi: number
}

export interface SmoothstepParams {
	edge0: number
	edge1: number
	x: number
}

export interface PiecewiseParams {
	domain: number[]
	range: number[]
	x: number
}
