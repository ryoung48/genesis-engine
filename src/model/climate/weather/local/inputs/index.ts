import { WEATHER_BASELINE } from "@/model/climate/weather/local/baseline"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_FIELDS } from "@/model/climate/weather/local/fields"
import type { WeatherInputs } from "@/model/climate/weather/local/inputs/types"
import type { SampleWeatherRegionParams } from "@/model/climate/weather/local/types"
import { NORMAL } from "@/model/shared/math/normal"

function sample({
	context,
	baseline,
	instant,
}: SampleWeatherRegionParams): WeatherInputs {
	const seasonal = (values: ArrayLike<number>) =>
		WEATHER_BASELINE.monthly({ values, phase: instant.phase })
	const meanU = seasonal(baseline.windU),
		meanV = seasonal(baseline.windV)
	const input = {
		seed: context.seed,
		xyz: baseline.location.xyz,
		radiusKm: context.radiusKm,
		seconds: instant.seconds,
		driftMs: [2 * meanU, 2 * meanV] as [number, number],
	}
	const field = (channel: string) =>
		WEATHER_FIELDS.sample({ ...input, channel })
	const solar = WEATHER_CLOCK.localSolar({
		instant,
		xyz: baseline.location.xyz,
	})
	const dtrC = baseline.dtr ? Math.max(0, seasonal(baseline.dtr)) : null
	const monthlyTemperatureC = seasonal(baseline.temperature)
	const temperatureNormalC =
		monthlyTemperatureC +
		(instant.locked
			? 0
			: ((dtrC ?? 0) / 2) * Math.cos(2 * Math.PI * (solar.phase - 0.625)))
	const annualRangeC =
		Math.max(...baseline.temperature) - Math.min(...baseline.temperature)
	const temperatureC =
		temperatureNormalC +
		Math.min(6, 1 + 0.12 * annualRangeC) * field("temperature")
	const dewPointC = baseline.dewPoint
		? Math.min(
				temperatureC,
				seasonal(baseline.dewPoint) + 1.5 * field("moisture"),
			)
		: null
	const windFactor = instant.locked
		? 1
		: 1 + 0.15 * Math.cos(2 * Math.PI * (solar.phase - 0.625))
	const branchField = field("weather-branch")
	const stormTrack = Math.sin((2 * solar.latitudeDeg * Math.PI) / 180) ** 2
	const windSpreadMs =
		2 + stormTrack + 2 * Math.min(2, Math.max(0, Math.abs(branchField) - 0.5))
	const rawU = meanU * windFactor + windSpreadMs * field("wind-east"),
		rawV = meanV * windFactor + windSpreadMs * field("wind-north")
	const rawSpeedMs = Math.hypot(rawU, rawV)
	const excessMs = Math.max(0, rawSpeedMs - 18)
	const windSpeedMs = rawSpeedMs - excessMs + excessMs / (1 + excessMs / 8)
	const windScale = rawSpeedMs > 0 ? windSpeedMs / rawSpeedMs : 1
	const windU = rawU * windScale,
		windV = rawV * windScale,
		gustMs =
			windSpeedMs +
			Math.max(1.5, 0.5 * windSpeedMs) * (0.6 + 0.8 * NORMAL.cdf(field("gust")))
	const cloudMean = baseline.cloud
		? Math.max(0, Math.min(1, seasonal(baseline.cloud)))
		: null
	const clearCoolingC =
		solar.daylight || dtrC === null
			? 0
			: Math.min(3, dtrC * 0.25) / (1 + windSpeedMs / 2)
	return {
		temperatureC,
		temperatureNormalC,
		dewPointC,
		windU,
		windV,
		windSpeedMs,
		gustMs,
		cloudMean,
		dtrC,
		solar,
		monthlyTemperatureC,
		surfaceC:
			temperatureC - (cloudMean === null ? 0 : clearCoolingC * (1 - cloudMean)),
		clearSurfaceC: temperatureC - clearCoolingC,
		afternoon: solar.daylight && solar.phase >= 0.5,
		monthlyRainMm: seasonal(baseline.rain),
		meanRateMmH: WEATHER_BASELINE.rainRate({
			baseline,
			phase: instant.phase,
			yearSeconds: instant.yearSeconds,
		}),
		branchDraw: NORMAL.cdf(branchField),
		eventDraw: NORMAL.cdf(field("weather-event")),
		precipitationDraw: NORMAL.cdf(field("weather-precipitation")),
	}
}
export const WEATHER_INPUTS = { sample }
