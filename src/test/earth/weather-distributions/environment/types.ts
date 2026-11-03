import type {
	WeatherDescriptionBand,
	WeatherReportCondition,
} from "@/model/climate/weather/local/description/types"
import type { LocalWeatherValues } from "@/model/climate/weather/local/types"
export interface WeatherEnvironmentSummary {
	samples: number
	cloudSamples: number
	cloudCoverSum: number
	cloudCategories: Record<string, number>
	cloudDescriptions: Record<string, number>
	genusPresent: Record<string, number>
	genusCover: Record<string, number>
	sky: Record<string, number>
	wind: Record<string, number>
	temperature: Record<string, number>
	departures: Record<string, number>
	windSum: number
	windMin: number | null
	windMax: number | null
	temperatureSum: number
	temperatureMin: number | null
	temperatureMax: number | null
	departureSum: number
	departureMin: number | null
	departureMax: number | null
}
export interface WeatherEnvironmentState {
	overall: WeatherEnvironmentSummary
	byCondition: Record<string, WeatherEnvironmentSummary>
	byPhenomenon: Record<string, WeatherEnvironmentSummary>
}
export interface WeatherEnvironmentRecordParams {
	state: WeatherEnvironmentState
	values: LocalWeatherValues
	conditions: Set<WeatherReportCondition>
}
export interface WeatherEnvironmentReport extends WeatherEnvironmentState {
	definitions: {
		wind: WeatherDescriptionBand[]
		temperature: WeatherDescriptionBand[]
		departureThresholdC: number
	}
}
