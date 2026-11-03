import type { WeatherSystem } from "@/model/climate/weather/local/decision/types"
import type { LocalWeatherValues } from "@/model/climate/weather/local/types"
import type { WeatherPhenomenon } from "@/model/climate/weather/local/vocabulary/types"
export type WeatherReportCondition =
	| WeatherPhenomenon
	| `system:${WeatherSystem}`
export type WeatherSky =
	| "clear"
	| "mostlyClear"
	| "partlyCloudy"
	| "mostlyCloudy"
	| "overcast"
	| "unavailable"
export type WeatherDeparture = "colderThanUsual" | "normal" | "warmerThanUsual"
export interface WeatherDescriptionBand {
	label: string
	minimum: number | null
	maximum: number | null
}
export type WeatherDepartureParams = Pick<
	LocalWeatherValues,
	"temperatureC" | "temperatureNormalC"
>
