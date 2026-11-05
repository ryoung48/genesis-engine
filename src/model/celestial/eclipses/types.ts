import type { MoonPrecessionRates } from "@/model/celestial/moons/mechanics/precession/types"
import type { MoonBody } from "@/model/celestial/moons/types"

export type EclipseVector = [number, number, number]
export type EclipseKind =
	| "solar-partial"
	| "solar-annular"
	| "solar-total"
	| "lunar-penumbral"
	| "lunar-partial"
	| "lunar-total"
	| "shadow-penumbral"
	| "shadow-partial"
	| "shadow-total"
	| "occultation-partial"
	| "occultation-annular"
	| "occultation-total"
export type EclipseCategory = "solar" | "lunar" | "shadow" | "occultation"
export type EclipseStatus = "complete" | "unavailable"

export interface EclipseConfiguration {
	star: EclipseVector
	moon: EclipseVector
	starRadiusM: number
	moonRadiusM: number
	planetRadiusM: number
}
export interface SolarEclipseParams extends EclipseConfiguration {
	observer: EclipseVector
}
export interface EclipseGeometry {
	status: "available" | "unavailable"
	kind: EclipseKind | null
	coverage: number
	margin: number
	penetration: number
}
export interface EclipseMoonState {
	moon: MoonBody
	semiMajorAxisM: number
	rates: MoonPrecessionRates
}
export interface EclipseEphemeris {
	moons: EclipseMoonState[]
	planetRadiusM: number
	starRadiusM: number
	starAt: (seconds: number) => EclipseVector
	starSpeedRatio: number
}
export interface PlanetEclipse {
	moonIdx: number
	moonLabel: string
	occluderIdx: number | null
	occluderLabel: string | null
	kind: EclipseKind
	ingressS: number
	egressS: number
	maximumS: number
	penetration: number
	clippedStart: boolean
	clippedEnd: boolean
}
export interface EclipseCalendarResult {
	status: EclipseStatus
	events: PlanetEclipse[]
	unavailableMoons: number[]
	unavailablePairs: [number, number][]
	evaluations: number
}
