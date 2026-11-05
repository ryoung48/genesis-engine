import type { KeplerElements } from "@/model/celestial/moons/mechanics/types"
import type { MoonBody } from "@/model/celestial/moons/types"

export interface MoonPrecessionRates {
	nodeRadPerDay: number
	apsisRadPerDay: number
}
export interface MoonPrecessionRatesParams {
	moon: MoonBody
	semiMajorAxisM: number
	planetRadiusM: number
	planetMassKg: number
	spinRateRadS: number
	obliquityDeg: number
	yearDays: number
}
export interface MoonPrecessedParams {
	moon: KeplerElements
	rates: MoonPrecessionRates
	t: number
}
export interface PlanetOblatenessParams {
	planetRadiusM: number
	planetMassKg: number
	spinRateRadS: number
}
export interface MoonPrecessedBodyParams {
	moon: MoonBody
	rates: MoonPrecessionRates
	t: number
}
