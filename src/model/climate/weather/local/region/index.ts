import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_CLOUDS } from "@/model/climate/weather/local/clouds"
import { WEATHER_DECISION } from "@/model/climate/weather/local/decision"
import { WEATHER_INPUTS } from "@/model/climate/weather/local/inputs"
import type {
	RegionWeatherEvaluationParams,
	RegionWeatherInspection,
} from "@/model/climate/weather/local/region/types"
import type {
	LocalWeatherValues,
	SampleWeatherRegionParams,
	WeatherTriggerTrace,
} from "@/model/climate/weather/local/types"

function sampleRaw(
	input: SampleWeatherRegionParams,
): LocalWeatherValues | null {
	if (!input.baseline.valid) return null
	const atmosphere = WEATHER_INPUTS.sample(input)
	const choices = WEATHER_DECISION.prepare({
		rainChance: WEATHER_DECISION.rainChance(
			(atmosphere.monthlyRainMm * WEATHER_CLOCK.earthYearSeconds) /
				input.instant.yearSeconds,
		),
		meanRateMmH: atmosphere.meanRateMmH,
		cloudMean: atmosphere.cloudMean,
		temperatureC: atmosphere.temperatureC,
		monthlyTemperatureC: atmosphere.monthlyTemperatureC,
		dewPointC: atmosphere.dewPointC,
		surfaceC: atmosphere.surfaceC,
		clearSurfaceC: atmosphere.clearSurfaceC,
		windSpeedMs: atmosphere.windSpeedMs,
		gustMs: atmosphere.gustMs,
		afternoon: atmosphere.afternoon,
		daylight: atmosphere.solar.daylight,
		particleSource: input.baseline.particleSource,
		aridity: input.baseline.aridity,
	})
	const result = WEATHER_DECISION.resolve({
		choices,
		draws: {
			branch: atmosphere.branchDraw,
			event: atmosphere.eventDraw,
			precipitation: atmosphere.precipitationDraw,
		},
	})
	const frozen = [
		"dusting",
		"tiny flakes",
		"ice crystals",
		"snow flurry",
		"snowfall",
		"blizzard",
	].includes(result.kind)
	const precipitation =
		result.rainRateMmH === 0
			? { liquid: 0, snow: 0, ice: 0 }
			: result.kind === "sleet"
				? { liquid: 0.5, snow: 0, ice: 0.5 }
				: frozen
					? { liquid: 0, snow: 1, ice: 0 }
					: { liquid: 1, snow: 0, ice: 0 }
	const extinction =
		(result.rainRateMmH * precipitation.snow) / 2.5 +
		((precipitation.snow > 0 || result.kind === "blizzard") &&
		atmosphere.gustMs >= 15.6
			? (atmosphere.gustMs / 15.6) ** 2
			: 0)
	let visibilityM = Math.max(50, 10000 / (1 + 24 * extinction))
	if (result.kind === "fog" || result.kind === "ice fog")
		visibilityM = Math.min(visibilityM, 100)
	else if (result.kind === "mist" || result.kind === "thin mist")
		visibilityM = Math.min(visibilityM, 2000)
	else if (result.cloud === "haze") visibilityM = Math.min(visibilityM, 5000)
	else if (result.kind === "sand storm" || result.kind === "dust storm")
		visibilityM = Math.min(visibilityM, 300)
	const clouds = WEATHER_CLOUDS.fromCategory({
		category: result.cloud,
		cover: result.cloudCover,
		phenomenon: result.kind,
	})
	return {
		system: result.system,
		particleSource: input.baseline.particleSource,
		cloudDescription: result.cloudCover === null ? null : result.cloud,
		precipitation,
		visibilityM,
		temperatureC: atmosphere.temperatureC,
		temperatureNormalC: atmosphere.temperatureNormalC,
		latitudeDeg: atmosphere.solar.latitudeDeg,
		solarElevationDeg: atmosphere.solar.elevationDeg,
		dewPointC: atmosphere.dewPointC,
		rainRateMmH: result.rainRateMmH,
		windU: atmosphere.windU,
		windV: atmosphere.windV,
		windSpeedMs: atmosphere.windSpeedMs,
		windDirectionDeg:
			atmosphere.windSpeedMs === 0
				? null
				: ((Math.atan2(-atmosphere.windU, -atmosphere.windV) * 180) / Math.PI +
						360) %
					360,
		gustMs: atmosphere.gustMs,
		cloudCover: result.cloudCover,
		clouds: clouds.clouds,
		conditions: [{ kind: result.kind, share: 1 }],
		dominant: result.kind,
		localHour: atmosphere.solar.hour,
		daylight: atmosphere.solar.daylight,
	}
}
function evaluate({
	weather,
	trace,
}: RegionWeatherEvaluationParams): LocalWeatherValues | null {
	const values = sampleRaw(weather)
	if (!values) return null
	if (values.dominant === "blizzard") {
		let persistent = values.gustMs >= 15.6 && values.visibilityM < 400
		for (let hours = 1; persistent && hours <= 3; hours++) {
			const previous = sampleRaw({
				...weather,
				instant: WEATHER_CLOCK.shift({
					instant: weather.instant,
					deltaSeconds: -hours * 3600,
				}),
			})
			persistent =
				previous !== null &&
				previous.dominant === "blizzard" &&
				previous.gustMs >= 15.6 &&
				previous.visibilityM < 400
		}
		if (!persistent) {
			values.dominant = "snowfall"
			values.conditions = [{ kind: "snowfall", share: 1 }]
		}
	}
	if (trace)
		trace({
			condition: values.dominant!,
			gates: [
				{
					name: "singlePrimaryPhenomenon",
					passed: values.conditions.length === 1,
				},
				{
					name: "waterPartition",
					passed:
						values.rainRateMmH === 0 ||
						Math.abs(
							values.precipitation.liquid +
								values.precipitation.snow +
								values.precipitation.ice -
								1,
						) < 1e-9,
				},
				{
					name: "clearSkyAgreement",
					passed:
						values.dominant !== "clear skies" ||
						values.cloudDescription === null ||
						values.cloudDescription === "clear skies",
				},
				{
					name: "blizzardWindAndVisibility",
					passed:
						values.dominant !== "blizzard" ||
						(values.gustMs >= 15.6 && values.visibilityM < 400),
				},
			],
		})
	return values
}
function sample(weather: SampleWeatherRegionParams): LocalWeatherValues | null {
	return evaluate({ weather, trace: null })
}
function inspect(weather: SampleWeatherRegionParams): RegionWeatherInspection {
	const triggers: WeatherTriggerTrace[] = []
	return {
		values: evaluate({ weather, trace: (trigger) => triggers.push(trigger) }),
		triggers,
	}
}
export const WEATHER_REGION = { sample, inspect }
