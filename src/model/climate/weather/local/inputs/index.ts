import { WEATHER_BASELINE } from "@/model/climate/weather/local/baseline"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_FIELDS } from "@/model/climate/weather/local/fields"
import type {
	WeatherInputs,
	WeatherWindVectorParams,
} from "@/model/climate/weather/local/inputs/types"
import type { SampleWeatherRegionParams } from "@/model/climate/weather/local/types"
import { NORMAL } from "@/model/shared/math/normal"

const LAND_CONVECTIVE_AMPLITUDE = 0.4
const OCEAN_CONVECTIVE_AMPLITUDE = -0.15
const STORM_SIDE_WIDENING_MS = 3
const CLEAR_SIDE_WIDENING_MS = 1
const WIND_SOFT_CAP_MS = 25
const WIND_CAP_SPAN_MS = 8
const FRONT_LAG_SECONDS = 3 * 3600
const FRONT_COOLING_C = 10
const FRONT_VEER = 4
const PRESSURE_TENDENCY_HPA = 12
const PRESSURE_TROPICAL_SHARE = 0.25
const CYCLONE_SEASON_SHARE = 0.01
const CYCLONE_SEASON_WINDOW_C = 3
const TROPICAL_STORM_MS = 17.5
const CYCLONE_WIND_SPAN_MS = 30

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
function scaled({ u, v, speedMs }: WeatherWindVectorParams): [number, number] {
	const raw = Math.hypot(u, v)
	return raw > 0 ? [(u * speedMs) / raw, (v * speedMs) / raw] : [speedMs, 0]
}

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
	const branchField = field("weather-branch")
	const frontChange =
		branchField -
		WEATHER_FIELDS.sample({
			...input,
			seconds: instant.seconds - FRONT_LAG_SECONDS,
			channel: "weather-branch",
		})
	const stormTrack = Math.sin((2 * solar.latitudeDeg * Math.PI) / 180) ** 2
	const dtrC = baseline.dtr ? Math.max(0, seasonal(baseline.dtr)) : null
	const monthlyTemperatureC = seasonal(baseline.temperature)
	const temperatureNormalC =
		monthlyTemperatureC +
		(instant.locked
			? 0
			: ((dtrC ?? 0) / 2) * Math.cos(2 * Math.PI * (solar.phase - 0.625)))
	const warmestC = Math.max(...baseline.temperature)
	const annualRangeC = warmestC - Math.min(...baseline.temperature)
	const temperatureC =
		temperatureNormalC +
		Math.min(6, 1 + 0.12 * annualRangeC) * field("temperature") -
		FRONT_COOLING_C * stormTrack * frontChange
	const dewPointC = baseline.dewPoint
		? Math.min(
				temperatureC,
				seasonal(baseline.dewPoint) + 1.5 * field("moisture"),
			)
		: null
	const windFactor = instant.locked
		? 1
		: 1 + 0.15 * Math.cos(2 * Math.PI * (solar.phase - 0.625))
	const windSpreadMs =
		2 +
		stormTrack +
		STORM_SIDE_WIDENING_MS * Math.min(2, Math.max(0, -branchField - 0.5)) +
		CLEAR_SIDE_WIDENING_MS * Math.min(2, Math.max(0, branchField - 0.5))
	const veer =
		Math.sign(solar.latitudeDeg) * FRONT_VEER * stormTrack * frontChange
	const rawU =
			meanU * windFactor + windSpreadMs * field("wind-east") + veer * meanV,
		rawV =
			meanV * windFactor + windSpreadMs * field("wind-north") - veer * meanU
	const rawSpeedMs = Math.hypot(rawU, rawV)
	const excessMs = Math.max(0, rawSpeedMs - WIND_SOFT_CAP_MS)
	const cappedMs =
		rawSpeedMs - excessMs + excessMs / (1 + excessMs / WIND_CAP_SPAN_MS)
	const cycloneShare =
		CYCLONE_SEASON_SHARE *
		baseline.cycloneRisk *
		clamp01(1 - (warmestC - monthlyTemperatureC) / CYCLONE_SEASON_WINDOW_C)
	const cycloneDraw = cycloneShare > 0 ? NORMAL.cdf(field("cyclone")) : 0
	const cyclone =
		cycloneShare > 0 && cycloneDraw > 1 - cycloneShare
			? (cycloneDraw - (1 - cycloneShare)) / cycloneShare
			: 0
	const windSpeedMs = Math.max(
		cappedMs,
		cyclone > 0 ? TROPICAL_STORM_MS + CYCLONE_WIND_SPAN_MS * cyclone ** 2 : 0,
	)
	const [windU, windV] = scaled({
		u: rawSpeedMs > 0 ? rawU : meanU,
		v: rawSpeedMs > 0 ? rawV : meanV,
		speedMs: windSpeedMs,
	})
	const gustDraw = NORMAL.cdf(field("gust"))
	const gustMs =
		windSpeedMs + Math.max(1.5, 0.5 * windSpeedMs) * (0.6 + 0.8 * gustDraw)
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
		convectiveBias: instant.locked
			? 0
			: (baseline.isLand
					? LAND_CONVECTIVE_AMPLITUDE
					: OCEAN_CONVECTIVE_AMPLITUDE) *
				Math.cos(2 * Math.PI * (solar.phase - 0.625)),
		stormTrack,
		pressureTendencyHpa:
			PRESSURE_TENDENCY_HPA *
			(PRESSURE_TROPICAL_SHARE + (1 - PRESSURE_TROPICAL_SHARE) * stormTrack) *
			frontChange,
		cyclone,
		monthlyRainMm: seasonal(baseline.rain),
		meanRateMmH: WEATHER_BASELINE.rainRate({
			baseline,
			phase: instant.phase,
			yearSeconds: instant.yearSeconds,
		}),
		branchDraw: NORMAL.cdf(branchField),
		eventDraw: NORMAL.cdf(field("weather-event")),
		precipitationDraw: NORMAL.cdf(field("weather-precipitation")),
		gustDraw,
		layerDraw: NORMAL.cdf(field("cloud-layer")),
	}
}
export const WEATHER_INPUTS = { sample }
