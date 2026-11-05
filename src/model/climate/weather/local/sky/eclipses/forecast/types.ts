import type { EclipseCalendar } from "@/model/celestial/eclipses/calendar/types"
import type { EclipseEphemeris } from "@/model/celestial/eclipses/types"
import type { WeatherClockRates } from "@/model/climate/weather/local/clock/types"
import type {
	CombinedCircumstances,
	LocalCircumstances,
} from "@/model/climate/weather/local/sky/eclipses/types"
import type { GenesisParams } from "@/model/pipelines/types"

export interface WeatherEclipseCache {
	params: GenesisParams
	ephemeris: EclipseEphemeris
	rates: WeatherClockRates
	yearSeconds: number
	dropped: string[]
	calendar: EclipseCalendar | null
	sites: Map<string, Map<string, LocalCircumstances | null>>
	combined: Map<string, Map<string, CombinedCircumstances | null>>
}
