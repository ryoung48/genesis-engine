import type { MoonBody } from "../types"

export interface HillSphereInput {
	planetOrbitalDistanceM: number
	planetMassKg: number
	starMassKg: number
}

export interface KeplerEquationInput {
	meanAnomalyRad: number
	eccentricity: number
}

export interface MoonPositionVectorInput {
	moon: MoonBody
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
