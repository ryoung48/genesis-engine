import { HUMIDITY } from "@/model/climate/precipitation/humidity"
import type { RelativeHumidityParams } from "@/model/climate/weather/local/comfort/types"

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

export const WEATHER_COMFORT = { relativeHumidity }
