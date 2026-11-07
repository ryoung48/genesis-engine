import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import type { WeatherBaseline } from "@/model/climate/weather/local/baseline/types"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import type {
	WeatherHour,
	WeatherMonth,
} from "@/model/climate/weather/local/outlook/types"
import type { SampleProvinceWeatherParams } from "@/model/climate/weather/local/types"

const HOURS = 24
const WIND_SAMPLES_PER_MONTH = 16

function hourly(params: SampleProvinceWeatherParams): WeatherHour[] {
	return Array.from({ length: HOURS }, (_, hoursAhead) => ({
		hoursAhead,
		values: LOCAL_WEATHER.sampleProvinceValues({
			...params,
			instant: WEATHER_CLOCK.shift({
				instant: params.instant,
				deltaSeconds: hoursAhead * 3600,
			}),
		}),
	})).filter((hour): hour is WeatherHour => hour.values !== null)
}

function monthly(params: SampleProvinceWeatherParams): WeatherMonth[] {
	const baselines = (
		params.context.provinces[params.province]?.baselines ?? []
	).filter((baseline) => baseline.valid && baseline.location.weight > 0)
	const weight = baselines.reduce((sum, b) => sum + b.location.weight, 0)
	if (!weight) return []
	const mean = (values: (baseline: WeatherBaseline) => number) =>
		baselines.reduce((sum, b) => sum + b.location.weight * values(b), 0) /
		weight
	return Array.from({ length: 12 }, (_, month) => {
		let wind = 0
		let samples = 0
		for (let k = 0; k < WIND_SAMPLES_PER_MONTH; k++) {
			const phase = (month + (k + 0.5) / WIND_SAMPLES_PER_MONTH) / 12
			const values = LOCAL_WEATHER.sampleProvinceValues({
				...params,
				instant: WEATHER_CLOCK.shift({
					instant: params.instant,
					deltaSeconds:
						(phase - params.instant.phase) * params.instant.yearSeconds,
				}),
			})
			if (!values) continue
			wind += values.windSpeedMs
			samples++
		}
		return {
			temperatureC: mean((b) => b.temperature[month]),
			daylightHours: mean((b) => b.daylightHours[month]),
			rainMm: mean((b) => b.rain[month]),
			windSpeedMs: samples ? wind / samples : 0,
		}
	})
}

export const WEATHER_OUTLOOK = { hourly, monthly }
