import type {
	LocalWeatherValues,
	SampleWeatherRegionParams,
	WeatherTraceSink,
	WeatherTriggerTrace,
} from "@/model/climate/weather/local/types"
export interface RegionWeatherEvaluationParams {
	weather: SampleWeatherRegionParams
	trace: WeatherTraceSink | null
}
export interface RegionWeatherInspection {
	values: LocalWeatherValues | null
	triggers: WeatherTriggerTrace[]
}
