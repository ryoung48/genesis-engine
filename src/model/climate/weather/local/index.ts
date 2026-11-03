import { WEATHER_AGGREGATION } from "@/model/climate/weather/local/aggregation"
import { WEATHER_BASELINE } from "@/model/climate/weather/local/baseline"
import { WEATHER_REGION } from "@/model/climate/weather/local/region"
import type {
	CreateLocalWeatherParams,
	ProvinceWeatherEvaluationParams,
	ProvinceWeatherInspection,
	SampleProvinceWeatherParams,
	WeatherContext,
	WeatherSnapshot,
} from "@/model/climate/weather/local/types"
import { PROVINCE_LOCATIONS } from "@/model/geography/terrain/provinces/locations"

async function createContext({
	world,
	revision,
	representatives,
	yearSeconds,
}: CreateLocalWeatherParams): Promise<WeatherContext> {
	const locations = world.provinces
		? PROVINCE_LOCATIONS.build({
				mesh: world.mesh,
				provinces: world.provinces,
				isLand: world.isLand,
				representatives,
			})
		: []
	const context: WeatherContext = {
		revision,
		seed: world.params.seed,
		radiusKm: world.params.planetRadiusKm,
		provinces: [],
	}
	for (let first = 0; first < locations.length; first += 256) {
		for (const location of locations.slice(first, first + 256))
			context.provinces.push({
				location,
				baselines: location.samples.map((point) =>
					WEATHER_BASELINE.build({ world, location: point, yearSeconds }),
				),
			})
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
	return context
}

function evaluateProvince({
	weather: { context, province, instant },
	trace,
}: ProvinceWeatherEvaluationParams): WeatherSnapshot {
	const prepared = context.provinces[province]
	const samples =
		prepared?.baselines.map((baseline) => {
			const input = { context, baseline, instant }
			const result = trace ? WEATHER_REGION.inspect(input) : null
			if (trace && result)
				trace({
					region: baseline.location.region,
					weight: baseline.location.weight,
					triggers: result.triggers,
				})
			return {
				region: baseline.location.region,
				weight: baseline.location.weight,
				values: result ? result.values : WEATHER_REGION.sample(input),
			}
		}) ?? []

	const values = WEATHER_AGGREGATION.combine({ samples })
	return {
		revision: context.revision,
		province,
		instant,
		status: values ? "ready" : "unavailable",
		reason: values ? null : "No valid climate samples for this province",
		approximateLocation: prepared?.location.approximateLocation ?? true,
		values,
		samples,
	}
}

function sampleProvince(weather: SampleProvinceWeatherParams): WeatherSnapshot {
	return evaluateProvince({ weather, trace: null })
}
function inspectProvince(
	weather: SampleProvinceWeatherParams,
): ProvinceWeatherInspection {
	const traces: ProvinceWeatherInspection["traces"] = []
	const snapshot = evaluateProvince({
		weather,
		trace: (sample) => traces.push(sample),
	})
	return { snapshot, traces }
}
export const LOCAL_WEATHER = { createContext, sampleProvince, inspectProvince }
