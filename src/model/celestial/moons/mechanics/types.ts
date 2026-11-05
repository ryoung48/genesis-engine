import type { MoonBody } from "@/model/celestial/moons/types"

export interface KeplerEquationInput {
	meanAnomalyRad: number
	eccentricity: number
}

export type KeplerElements = Pick<
	MoonBody,
	| "orbitalPeriodDays"
	| "eccentricity"
	| "inclinationDeg"
	| "longitudeOfAscendingNodeDeg"
	| "longitudeOfPerihelionDeg"
	| "meanAnomalyAtEpochDeg"
>

export interface MoonPositionVectorInput {
	moon: KeplerElements
	semiMajorAxisM: number
	t: number
}

export interface MoonSemiMajorAxisInput {
	moon: MoonBody
	planetMassKg: number
}

export interface MoonPeriodFromAxisInput {
	semiMajorAxisM: number
	planetMassKg: number
}

export interface RocheLimitInput {
	planetRadiusM: number
	moonMassKg: number
	moonDiameterM: number
}

export interface MoonPeriodBoundsInput {
	moon: MoonBody
	planetMassKg: number
	starMassKg: number
	planetRadiusKm: number
	orbitalDistanceAU: number
}

export interface MoonPeriodBounds {
	minDays: number
	maxDays: number
	valid: boolean
}

export interface OrbitalPosition {
	latRad: number
	lonRad: number
	distanceM: number
	trueAnomalyRad: number
}

export interface OrbitalPositionVector {
	x: number
	y: number
	z: number
	distanceM: number
	trueAnomalyRad: number
}
