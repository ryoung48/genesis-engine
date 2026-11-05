import type { EclipseVector } from "@/model/celestial/eclipses/types"

export interface ShadowParams {
	star: EclipseVector
	occluder: EclipseVector
	target: EclipseVector
	starRadiusM: number
	occluderRadiusM: number
	targetRadiusM: number
}
export interface ShadowState {
	valid: boolean
	penumbra: number
	umbra: number
	antumbra: number
	contained: boolean
}
export interface ConeDistanceParams {
	x: number
	r: number
	start: number
	end: number
	slope: number
	intercept: number
}
