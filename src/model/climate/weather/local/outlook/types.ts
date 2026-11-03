import type { LocalWeatherValues } from "@/model/climate/weather/local/types"

export interface WeatherHour {
	hoursAhead: number
	values: LocalWeatherValues
}

export interface WeatherMonth {
	temperatureC: number
	rainMm: number
	windSpeedMs: number
}

export interface WeatherOutlook {
	hourly: WeatherHour[]
	monthly: WeatherMonth[]
}
