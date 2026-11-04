import type { MoonBody } from "@/model/celestial/moons/types"
import type { WeatherInstant } from "@/model/climate/weather/local/clock/types"

export type SkyCycle = "cycle" | "alwaysUp" | "neverUp" | "locked"

export type MoonPhase =
	| "new"
	| "waxingCrescent"
	| "firstQuarter"
	| "waxingGibbous"
	| "full"
	| "waningGibbous"
	| "lastQuarter"
	| "waningCrescent"

export interface SkyParams {
	instant: WeatherInstant
	latitudeDeg: number
}

export interface MoonSkyParams extends SkyParams {
	moons: MoonBody[]
}

export interface SunSky {
	cycle: SkyCycle
	riseHour: number | null
	setHour: number | null
	daylightHours: number | null
}

export interface MoonSky {
	label: string
	phase: MoonPhase
	illumination: number
	waxing: boolean
	cycle: SkyCycle
	riseHour: number | null
	setHour: number | null
	upHours: number | null
}

export interface HalfArcParams {
	latitudeRad: number
	declinationRad: number
	horizonRad: number
}

export interface RiseSetParams {
	halfArc: number | null
	transitHour: number
	dayHours: number
}
