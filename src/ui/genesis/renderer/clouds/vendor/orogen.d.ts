export interface CloudClimateGrid {
	P: Float32Array
	T: Float32Array
	slp: Float32Array
	u: Float32Array
	v: Float32Array
	sstAnom: Float32Array
	seaIce: Uint8Array
	sea: Uint8Array
}

export type CloudStorm = [number, number, number, number, number]

export const CLOUDS: {
	sizeKm: number
	stretch: number
	warp1: number
	warp2: number
	w0: number
	w1: number
	w2: number
	contrast: number
	edgeLow: number
	edgeConv: number
	edgeFront: number
	edgeCirrus: number
	veil: number
	veilWidth: number
	erosion: number
	detail: number
	sharp: number
	opLow: number
	opConv: number
	opFront: number
	opCirrus: number
	greyLow: number
	greyCirrus: number
	light: number
	billow: number
	relief: number
	thick: number
	thinOp: number
	thinGrey: number
	streakLat: number[]
	lowScale: number
	convScale: number
	cirrusScale: number
	streakFrontKm: number
	streakCirrusKm: number
	windFull: number
	shadow: number
	shadowKm: number
	aa: number[]
	storms: number
	stormKm: number
	stormTwist: number
	stormCover: number
	tropical: number
	tropicalTwist: number
	weatherScale: number
	weatherAmp: number
	streakVary: number
	cirrusWarp: number
	cirrusFine: number
	driftDegPerS: number
	evolve: number
	flowPeriod: number
	flowKm: number
	flowLat: number[]
	QLow: number[]
	QConv: number[]
	QFront: number[]
	QCirrus: number[]
}
export const MAX_STORMS: number
export const CLOUD_GLSL: string

export function cloudFields(climate: CloudClimateGrid): {
	w: number
	h: number
	cover: Uint8Array<ArrayBuffer>
	wind: Uint8Array<ArrayBuffer>
}
export function cloudNoiseTexture(): {
	N: number
	data: Uint8Array<ArrayBuffer>
}
export function cloudStorms(
	seed: number,
	climate: CloudClimateGrid,
): CloudStorm[]
export function cloudStormsAt(storms: CloudStorm[], time: number): CloudStorm[]
export function scaleOf(): number
export function driftRadPerS(): number
export function cloudEdges(): number[]
export function cloudQuantileList(): number[]
