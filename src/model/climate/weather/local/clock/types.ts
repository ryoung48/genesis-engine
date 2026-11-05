import type { GenesisParams } from "@/model/pipelines/types"

export interface WeatherInstant {
	seconds: number
	year: number
	phase: number
	yearSeconds: number
	rotationSeconds: number
	solarDaySeconds: number | null
	referencePhase: number
	solarLongitudeRad: number
	tiltDeg: number
	sun: [number, number, number]
	locked: boolean
	retrograde: boolean
}

export interface WeatherManualTime {
	year: number
	month: number
	day: number
	dialHour: number
}

export interface ResolveWeatherClockParams {
	params: GenesisParams
	elapsedYears: number
	manual: WeatherManualTime | null
}

export interface LocalSolarParams {
	instant: WeatherInstant
	xyz: [number, number, number]
}

export interface WeatherClockSelection {
	current: boolean
	manual: WeatherManualTime
	instant: WeatherInstant
	params: GenesisParams
}
export interface SelectWeatherClockParams {
	params: GenesisParams
	elapsedYears: number
	manual: WeatherManualTime
	current: boolean
	previous: WeatherClockSelection | null
}

export interface ShiftWeatherInstantParams {
	instant: WeatherInstant
	deltaSeconds: number
}

export interface LocalSolarState {
	heating: number
	elevationDeg: number
	latitudeDeg: number
	daylight: boolean
	phase: number
	hour: number | null
}

export interface WeatherSeasonParams {
	instant: WeatherInstant
	latitudeDeg: number
}

export interface WeatherEclipticParams {
	params: GenesisParams
	seconds: number
}

export interface WeatherEclipticState {
	solarLongitudeRad: number
	starDistanceM: number
	yearSeconds: number
	day: number
	next: number
	fraction: number
	librationRad: number
}

export interface WeatherClockRates {
	starSpeedRatio: number
	frameRadS: number
}
