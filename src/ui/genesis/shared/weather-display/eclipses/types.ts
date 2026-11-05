import type { WeatherInstant } from "@/model/climate/weather/local/clock/types"
import type {
	CombinedEclipse,
	LocalEclipse,
	WeatherEclipseLocalResult,
} from "@/model/climate/weather/local/sky/eclipses/types"
import type { GenesisParams } from "@/model/pipelines/types"

export interface EclipseRowsParams {
	result: WeatherEclipseLocalResult
	instant: WeatherInstant
}
export interface EclipseRowParams {
	event: LocalEclipse
	instant: WeatherInstant
	current: boolean
}
export interface EclipsePlanetParams {
	params: GenesisParams
}
export interface EclipseTimeParams {
	maximumS: number
	localHour: number | null
	dayOffset: number
	instant: WeatherInstant
}
export interface EclipseCombinedRowParams {
	group: CombinedEclipse
	instant: WeatherInstant
}
