import { HUMIDITY } from "@/model/climate/precipitation/humidity"
import type {
	ApparentTemperatureParams,
	HeatIndexParams,
	RelativeHumidityParams,
} from "@/model/climate/weather/local/comfort/types"

function relativeHumidity({
	temperatureC,
	dewPointC,
}: RelativeHumidityParams): number | null {
	if (dewPointC === null || !Number.isFinite(dewPointC)) return null
	return Math.min(
		100,
		(100 * HUMIDITY.saturationVaporPressureKpa(dewPointC)) /
			HUMIDITY.saturationVaporPressureKpa(temperatureC),
	)
}

function heatIndexF({ t, rh }: HeatIndexParams): number {
	const simple = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094)
	if ((simple + t) / 2 < 80) return simple
	let index =
		-42.379 +
		2.04901523 * t +
		10.14333127 * rh -
		0.22475541 * t * rh -
		0.00683783 * t * t -
		0.05481717 * rh * rh +
		0.00122874 * t * t * rh +
		0.00085282 * t * rh * rh -
		0.00000199 * t * t * rh * rh
	if (rh < 13 && t >= 80 && t <= 112)
		index -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17)
	if (rh > 85 && t >= 80 && t <= 87) index += ((rh - 85) / 10) * ((87 - t) / 5)
	return index
}

function apparentTemperature({
	temperatureC,
	relativeHumidity: rh,
	windSpeedMs,
}: ApparentTemperatureParams): number {
	const t = (temperatureC * 9) / 5 + 32
	const mph = windSpeedMs * 2.23694
	if (t <= 50 && mph > 3) {
		const v = mph ** 0.16
		const chill = 35.74 + 0.6215 * t - 35.75 * v + 0.4275 * t * v
		return ((Math.min(t, chill) - 32) * 5) / 9
	}
	if (t >= 80 && rh !== null)
		return ((Math.max(t, heatIndexF({ t, rh })) - 32) * 5) / 9
	return temperatureC
}

export const WEATHER_COMFORT = { relativeHumidity, apparentTemperature }
