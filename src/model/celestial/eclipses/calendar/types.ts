import type {
	EclipseCategory,
	EclipseEphemeris,
	EclipseKind,
	EclipseMoonState,
	PlanetEclipse,
} from "@/model/celestial/eclipses/types"
import type { ScanRate, ScanState } from "@/model/shared/math/scan/types"

export interface EclipseTrackKind {
	kind: EclipseKind
	moon: EclipseMoonState
	occluder: EclipseMoonState | null
}
export interface EclipseTrack {
	category: EclipseCategory
	rate: (seconds: number) => ScanRate
	state: ScanState
	events: PlanetEclipse[]
	margin: (seconds: number) => number
	kindAt: (seconds: number) => EclipseTrackKind
}
export interface EclipseCalendar {
	ephemeris: EclipseEphemeris
	startS: number
	tracks: EclipseTrack[]
	invalid: boolean
	unavailableMoons: number[]
	unavailablePairs: [number, number][]
}
export interface EclipseCalendarCreateParams {
	ephemeris: EclipseEphemeris
	startS: number
}
export interface EclipseCalendarExtendParams {
	calendar: EclipseCalendar
	endS: number
}
export interface EclipseCalendarEventsParams {
	calendar: EclipseCalendar
	startS: number
	endS: number
	followS: number
}
export interface EclipseTrackParams {
	calendar: EclipseCalendar
	track: EclipseTrack
}
export interface EclipseEventParams extends EclipseTrackParams {
	ingressS: number
	egressS: number
	clippedEnd: boolean
}
export interface EclipseAdvanceParams extends EclipseTrackParams {
	endS: number
}
export interface EclipseMoonAtParams {
	moon: EclipseMoonState
	seconds: number
}
export interface EclipseMoonMotion {
	speed: number
	periapsis: number
	apoapsis: number
	radius: number
}
export interface EclipseTrackBuildParams {
	ephemeris: EclipseEphemeris
	moon: EclipseMoonState
	other: EclipseMoonState
}
export interface EclipseOccultationMarginParams {
	near: EclipseMoonState
	far: EclipseMoonState
	planetRadiusM: number
	nearPosition: [number, number, number]
	farPosition: [number, number, number]
}
export interface EclipseMoonValidityParams {
	moon: EclipseMoonState
	planetRadiusM: number
}
export interface EclipseBodyTrackParams {
	ephemeris: EclipseEphemeris
	moon: EclipseMoonState
}
export interface EclipseRateBin {
	rMin: number
	rMax: number
	speed: number
}
export interface EclipseKinematics extends EclipseRateBin {
	untilS: number
}
export interface EclipseRateTable {
	edges: number[]
	bins: EclipseRateBin[]
}
