import type { MoonBody } from "@/model/celestial/moons/types"
import type { WeatherInstant } from "@/model/climate/weather/local/clock/types"
import type { MarineShore } from "@/model/climate/weather/local/marine/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type MarineTideDirection = "rising" | "falling" | "steady"

export type MarineTidePhase = "spring" | "between" | "neap"

export interface MarineTideEvent {
	seconds: number
	levelM: number
	localHour: number | null
	dayOffset: number
}

export interface MarineTide {
	levelM: number
	direction: MarineTideDirection
	high: MarineTideEvent | null
	low: MarineTideEvent | null
	dayRangeM: number | null
	phase: MarineTidePhase | null
	springRangeM: number
}

export interface MarineTideParams {
	instant: WeatherInstant
	moons: MoonBody[]
	shore: MarineShore
	params: GenesisParams
}

export interface MarineTideBody {
	strength: number
	transitSeconds: number | null
}

export interface MarineTideLevelParams {
	seconds: number
}

export interface MarineTideEventParams {
	index: number
	level: number
}

export interface MarineTideStrengthParams {
	massKg: number
	distanceM: number
	planetMassKg: number
	planetRadiusM: number
}

export interface MarineTidePhaseParams {
	dayRangeM: number
	springRangeM: number
}
