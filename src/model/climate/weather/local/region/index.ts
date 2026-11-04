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
import type { WeatherPhenomenon } from "@/model/climate/weather/local/vocabulary/types"

const RAIN_EXTINCTION_EXPONENT = 0.6
const RAIN_EXTINCTION_COEFFICIENT = 0.025
const OUTFLOW_BASE_MS = 10
const OUTFLOW_SPAN_MS = 10
const OUTFLOW_AFTERNOON_MS = 10
const OUTFLOW_HAIL_MS = 5
const OUTFLOW_SEVERE_MS = 5
const HURRICANE_MS = 32.9
const LIMITS = WEATHER_DECISION.limits()
const CONVECTIVE: WeatherPhenomenon[] = [
	"thunderstorm",
	"hail",
	"tornado",
	"thundersnow",
]
const TORNADO_GUST_MS = 29
const TORNADO_GUST_SPAN_MS = 20
const FROZEN: WeatherPhenomenon[] = [
	"light snow",
	"moderate snow",
	"heavy snow",
	"snow showers",
	"heavy snow showers",
	"thundersnow",
	"blizzard",
]
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
		daylight: atmosphere.solar.daylight,
		particleSource: input.baseline.particleSource,
		aridity: input.baseline.aridity,
		convectiveBias: atmosphere.convectiveBias,
		land: input.baseline.isLand,
		stormTrack: atmosphere.stormTrack,
		severeRisk: input.baseline.tornadoRisk,
		pressureTendencyHpa: atmosphere.pressureTendencyHpa,
	})
	const cyclone = atmosphere.cyclone > 0
	const decision = WEATHER_DECISION.resolve({
		choices,
		draws: {
			branch: cyclone ? 0 : atmosphere.branchDraw,
			event: atmosphere.eventDraw,
			layer: atmosphere.layerDraw,
			precipitation: cyclone
				? atmosphere.precipitationDraw * choices.acceptance
				: atmosphere.precipitationDraw,
		},
	})
	const result = cyclone
		? {
				...decision,
				system: "stormy" as const,
				kind: (atmosphere.windSpeedMs >= HURRICANE_MS
					? "hurricane"
					: "tropical storm") as WeatherPhenomenon,
			}
		: decision
	const gustMs = CONVECTIVE.includes(result.kind)
		? Math.max(
				atmosphere.gustMs,
				OUTFLOW_BASE_MS +
					OUTFLOW_SPAN_MS * atmosphere.gustDraw +
					OUTFLOW_AFTERNOON_MS * Math.max(0, atmosphere.convectiveBias) +
					(result.kind === "hail" ? OUTFLOW_HAIL_MS : 0) +
					OUTFLOW_SEVERE_MS * input.baseline.tornadoRisk,
				result.kind === "tornado"
					? TORNADO_GUST_MS + TORNADO_GUST_SPAN_MS * atmosphere.gustDraw
					: 0,
			)
		: atmosphere.gustMs
	const frozen = FROZEN.includes(result.kind)
	const precipitation =
		result.rainRateMmH === 0
			? { liquid: 0, snow: 0, ice: 0 }
			: result.kind === "rain and snow"
				? { liquid: 0.5, snow: 0.5, ice: 0 }
				: result.kind === "hail"
					? { liquid: 0, snow: 0, ice: 1 }
					: frozen
						? { liquid: 0, snow: 1, ice: 0 }
						: { liquid: 1, snow: 0, ice: 0 }
	const extinction =
		(result.rainRateMmH * precipitation.snow) / 2.5 +
		((precipitation.snow > 0 || result.kind === "blizzard") &&
		gustMs >= LIMITS.blizzardGustMs
			? (gustMs / LIMITS.blizzardGustMs) ** 2
			: 0)
	const rainExtinction =
		(result.rainRateMmH * precipitation.liquid) ** RAIN_EXTINCTION_EXPONENT *
		RAIN_EXTINCTION_COEFFICIENT
	let visibilityM = Math.max(
		50,
		10000 / (1 + 24 * (extinction + rainExtinction)),
	)
	if (
		result.kind === "fog" ||
		result.kind === "freezing fog" ||
		result.kind === "ice fog"
	)
		visibilityM = Math.min(visibilityM, 100)
	else if (result.kind === "mist") visibilityM = Math.min(visibilityM, 2000)
	else if (result.kind === "haze") visibilityM = Math.min(visibilityM, 5000)
	else if (result.kind === "sand storm" || result.kind === "dust storm")
		visibilityM = Math.min(visibilityM, 300)
	else if (result.kind === "blowing sand" || result.kind === "blowing dust")
		visibilityM = Math.min(visibilityM, 5000)
	const clouds = WEATHER_CLOUDS.fromCategory({
		category: result.cloud,
		cover: result.cloudCover,
		phenomenon: result.kind,
	})
	return {
		regime: result.regime,
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
		gustMs,
		pressureTendencyHpa: atmosphere.pressureTendencyHpa,
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
		let persistent =
			values.gustMs >= LIMITS.blizzardGustMs &&
			values.visibilityM < LIMITS.blizzardVisibilityM
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
				previous.gustMs >= LIMITS.blizzardGustMs &&
				previous.visibilityM < LIMITS.blizzardVisibilityM
		}
		if (!persistent) {
			values.dominant = WEATHER_DECISION.band({
				kind: "light snow",
				rateMmH: values.rainRateMmH,
				stratiform: false,
			})
			values.conditions = [{ kind: values.dominant, share: 1 }]
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
						values.cloudCover === null ||
						values.cloudCover <= 0.25,
				},
				{
					name: "blizzardWindAndVisibility",
					passed:
						values.dominant !== "blizzard" ||
						(values.gustMs >= LIMITS.blizzardGustMs &&
							values.visibilityM < LIMITS.blizzardVisibilityM),
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
