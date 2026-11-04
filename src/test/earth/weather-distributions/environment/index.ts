import { WEATHER_CLOUDS } from "@/model/climate/weather/local/clouds"
import { WEATHER_DESCRIPTION } from "@/model/climate/weather/local/description"
import { WEATHER_VOCABULARY } from "@/model/climate/weather/local/vocabulary"
import type {
	WeatherEnvironmentRecordParams,
	WeatherEnvironmentReport,
	WeatherEnvironmentState,
	WeatherEnvironmentSummary,
} from "@/test/earth/weather-distributions/environment/types"

function summary(): WeatherEnvironmentSummary {
	return {
		samples: 0,
		cloudSamples: 0,
		cloudCoverSum: 0,
		cloudCategories: Object.fromEntries(
			WEATHER_CLOUDS.categories().map((kind) => [kind, 0]),
		),
		cloudDescriptions: Object.fromEntries(
			[...WEATHER_VOCABULARY.clouds(), "unavailable"].map((kind) => [kind, 0]),
		),
		genusPresent: {},
		genusCover: {},
		sky: {},
		wind: Object.fromEntries(
			WEATHER_DESCRIPTION.windBands().map((band) => [band.label, 0]),
		),
		temperature: Object.fromEntries(
			WEATHER_DESCRIPTION.temperatureBands().map((band) => [band.label, 0]),
		),
		departures: { colderThanUsual: 0, normal: 0, warmerThanUsual: 0 },
		windSum: 0,
		windMin: null,
		windMax: null,
		temperatureSum: 0,
		temperatureMin: null,
		temperatureMax: null,
		departureSum: 0,
		departureMin: null,
		departureMax: null,
	}
}
function create(): WeatherEnvironmentState {
	return {
		overall: summary(),
		byCondition: {},
		byPhenomenon: Object.fromEntries(
			WEATHER_VOCABULARY.inventory().map((kind) => [kind, summary()]),
		),
	}
}
function record({ state, values, conditions }: WeatherEnvironmentRecordParams) {
	const cloudDescription = WEATHER_VOCABULARY.cloud(values) ?? "unavailable",
		phenomena = WEATHER_VOCABULARY.describeAll(values),
		cloud = WEATHER_CLOUDS.representative(values),
		sky = WEATHER_DESCRIPTION.sky(values.cloudCover),
		wind = WEATHER_DESCRIPTION.wind(values.windSpeedMs),
		temperature = WEATHER_DESCRIPTION.temperature(values.temperatureC),
		departure = WEATHER_DESCRIPTION.departure(values),
		delta = values.temperatureC - values.temperatureNormalC
	const groups = [
		state.overall,
		...phenomena.map((kind) => state.byPhenomenon[kind]),
		...[...conditions, `regime:${values.regime}`].map(
			(kind) =>
				state.byCondition[kind] ?? (state.byCondition[kind] = summary()),
		),
	]
	for (const group of groups) {
		group.samples++
		group.cloudCategories[cloud]++
		group.cloudDescriptions[cloudDescription]++
		group.sky[sky] = (group.sky[sky] ?? 0) + 1
		if (values.cloudCover !== null && values.clouds !== null) {
			group.cloudSamples++
			group.cloudCoverSum += values.cloudCover
			for (const genus of values.clouds) {
				if (genus.cover <= 0) continue
				group.genusPresent[genus.genus] =
					(group.genusPresent[genus.genus] ?? 0) + 1
				group.genusCover[genus.genus] =
					(group.genusCover[genus.genus] ?? 0) + genus.cover
			}
		}
		group.wind[wind]++
		group.temperature[temperature]++
		group.departures[departure]++
		group.windSum += values.windSpeedMs
		group.windMin = Math.min(
			group.windMin ?? values.windSpeedMs,
			values.windSpeedMs,
		)
		group.windMax = Math.max(
			group.windMax ?? values.windSpeedMs,
			values.windSpeedMs,
		)
		group.temperatureSum += values.temperatureC
		group.temperatureMin = Math.min(
			group.temperatureMin ?? values.temperatureC,
			values.temperatureC,
		)
		group.temperatureMax = Math.max(
			group.temperatureMax ?? values.temperatureC,
			values.temperatureC,
		)
		group.departureSum += delta
		group.departureMin = Math.min(group.departureMin ?? delta, delta)
		group.departureMax = Math.max(group.departureMax ?? delta, delta)
	}
}
function report(state: WeatherEnvironmentState): WeatherEnvironmentReport {
	return {
		...state,
		definitions: {
			wind: WEATHER_DESCRIPTION.windBands(),
			temperature: WEATHER_DESCRIPTION.temperatureBands(),
			departureThresholdC: WEATHER_DESCRIPTION.departureThresholdC(),
		},
	}
}
export const WEATHER_ENVIRONMENT = { create, record, report }
